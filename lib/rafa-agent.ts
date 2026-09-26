/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only'

import { randomUUID } from 'node:crypto'

import { createBalcaoDeepLink } from '@/lib/deeplink'
import { loadRafaStore, type RafaChange, type RafaInventoryProduct, type RafaStoreState } from '@/lib/inventory/rafa-store'
import { getMalvoItem, refreshMalvoItem } from '@/lib/malvo/client'
import { syncMalvoItem } from '@/lib/malvo/sync'
import { rafaAiBudgetAvailable, recordAiUsage } from '@/lib/rafa-ai'
import { askRafaConfirmation } from '@/lib/rafa-confirm'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendText } from '@/lib/whatsapp'
import { enqueueWhatsApp, normalizePhone } from '@/lib/whatsapp-evolution'
import { FLOW_HINT, isBalcaoFlow } from '@/lib/whatsapp-flows'
import { isValidGtin } from '@/lib/whatsapp-router'

// Rafa conversacional: responde dúvidas com dados reais da loja (estoque, vendas, banco)
// e propõe alterações. Consultas e links saem direto; toda alteração passa pelo Sim/Não.

export const RAFA_AGENT_MODEL = 'openai/gpt-oss-120b'
const GROQ_BASE = 'https://api.groq.com/openai/v1'
const MAX_STEPS = 6

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const units = (milli: number) => Math.round(milli) / 1000

function normalizeText(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

// ---------- Loja do número ----------

export type RafaStoreResolution =
  | { status: 'ok'; storeId: string }
  | { status: 'none' }
  | { status: 'multiple'; stores: Array<{ id: string; name: string }> }

function localPhone(value: string) {
  const digits = String(value || '').replace(/\D/g, '')
  const withoutCountry = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits
  return withoutCountry.slice(-11)
}

export async function bindRafaStore(waId: string, storeId: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('wa_store_bindings').upsert({
    wa_id: normalizePhone(waId),
    store_id: storeId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'wa_id' })
  if (error) throw error
}

export async function resolveRafaStore(waId: string): Promise<RafaStoreResolution> {
  const admin = createAdminClient()
  const wa = normalizePhone(waId)

  const { data: binding } = await admin.from('wa_store_bindings').select('store_id').eq('wa_id', wa).maybeSingle()
  if (binding?.store_id) {
    const { data: store } = await admin.from('inventory_v1_stores').select('id').eq('id', binding.store_id).eq('active', true).maybeSingle()
    if (store) return { status: 'ok', storeId: String(store.id) }
  }

  const { data: session } = await admin.from('whatsapp_sessions').select('store_id,expires_at').eq('wa_id', wa).maybeSingle()
  if (session?.store_id && new Date(session.expires_at).getTime() > Date.now()) {
    await bindRafaStore(wa, String(session.store_id))
    return { status: 'ok', storeId: String(session.store_id) }
  }

  const list = await phoneStores(wa)
  if (!list.length) return { status: 'none' }
  if (list.length === 1) {
    await bindRafaStore(wa, list[0].id)
    return { status: 'ok', storeId: list[0].id }
  }
  return { status: 'multiple', stores: list }
}

// Lojas cujo cadastro (empresa ou perfil do dono/membro) tem este telefone.
export async function phoneStores(waId: string): Promise<Array<{ id: string; name: string }>> {
  const admin = createAdminClient()
  const phone = localPhone(normalizePhone(waId))
  if (phone.length < 10) return []
  const businessIds = new Set<string>()
  const { data: businesses } = await admin.from('balcao_businesses').select('id,phone').eq('active', true).not('phone', 'is', null)
  for (const row of businesses || []) if (localPhone(String(row.phone)) === phone) businessIds.add(String(row.id))
  const { data: profiles } = await admin.from('balcao_profiles').select('user_id,phone').not('phone', 'is', null)
  const userIds = (profiles || []).filter((row) => localPhone(String(row.phone)) === phone).map((row) => String(row.user_id))
  if (userIds.length) {
    const { data: members } = await admin.from('balcao_business_members').select('business_id').in('user_id', userIds).eq('active', true)
    for (const row of members || []) businessIds.add(String(row.business_id))
  }
  if (!businessIds.size) return []

  const { data: stores } = await admin.from('inventory_v1_stores')
    .select('id,display_name')
    .in('business_id', [...businessIds])
    .eq('active', true)
    .order('created_at', { ascending: true })
  return (stores || []).map((row) => ({ id: String(row.id), name: String(row.display_name || 'Loja') }))
}

export const STORE_PICK_PREFIX = 'store:'

export async function askStorePick(waId: string, stores: Array<{ id: string; name: string }>, inReplyTo?: string) {
  return enqueueWhatsApp({
    to: waId,
    kind: 'menu_fallback',
    payload: {
      body: 'Com qual loja você quer falar?',
      buttons: stores.slice(0, 9).map((store) => ({ id: `${STORE_PICK_PREFIX}${store.id}`, title: store.name })),
    },
    inReplyTo,
  })
}

// ---------- Ferramentas (leitura) ----------

function activeProducts(state: RafaStoreState) {
  return state.products.filter((product) => !product.deletedAt)
}

function productView(product: RafaInventoryProduct) {
  return {
    id: product.id,
    nome: product.name,
    ean: product.barcode,
    unidade: product.unit || 'UN',
    preco: money(product.priceCents),
    custo_medio: money(Math.round(product.averageCostCents || 0)),
    estoque: units(product.stockMilli),
    estoque_minimo: units(product.minStockMilli || 0),
  }
}

const STOPWORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'o', 'a', 'os', 'as', 'e', 'com', 'para', 'pra', 'em', 'no', 'na', 'um', 'uma', 'que', 'tem', 'temos', 'quantos', 'quantas', 'qual', 'quais'])

function singular(token: string) {
  return token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token
}

export function searchStoreProducts(state: RafaStoreState, term: string) {
  const products = activeProducts(state)
  const query = normalizeText(term)
  if (!query) return products.slice(0, 15)
  const digits = term.replace(/\D/g, '')
  if (digits.length >= 8) {
    const byCode = products.filter((product) => product.barcode.includes(digits))
    if (byCode.length) return byCode.slice(0, 15)
  }
  const tokens = query.split(' ').filter((token) => token.length > 1 && !STOPWORDS.has(token)).map(singular)
  if (!tokens.length) return []
  const scored = products.map((product) => {
    const words = normalizeText(`${product.name} ${product.catalogBrand || ''}`).split(' ').map(singular)
    const hits = tokens.filter((token) => words.some((word) => word.startsWith(token))).length
    return { product, hits }
  }).filter((row) => row.hits > 0)
  scored.sort((a, b) => b.hits - a.hits || a.product.name.localeCompare(b.product.name))
  const best = scored[0]?.hits ?? 0
  return scored.filter((row) => row.hits === best).slice(0, 15).map((row) => row.product)
}

function periodRange(periodo: string, de?: string, ate?: string) {
  const now = new Date()
  const spDay = (offsetDays: number) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(now.getTime() + offsetDays * 86_400_000)).map((part) => [part.type, part.value]))
    return new Date(`${parts.year}-${parts.month}-${parts.day}T03:00:00.000Z`)
  }
  if (de) {
    const start = new Date(`${de}T03:00:00.000Z`)
    const end = ate ? new Date(new Date(`${ate}T03:00:00.000Z`).getTime() + 86_400_000) : now
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) return { start, end, label: `${de} a ${ate || 'hoje'}` }
  }
  switch (periodo) {
    case 'ontem': return { start: spDay(-1), end: spDay(0), label: 'ontem' }
    case 'semana': return { start: spDay(-6), end: now, label: 'últimos 7 dias' }
    case 'mes': {
      const today = spDay(0)
      const first = new Date(today)
      first.setUTCDate(1)
      return { start: first, end: now, label: 'este mês' }
    }
    case '30dias': return { start: spDay(-29), end: now, label: 'últimos 30 dias' }
    case 'tudo': return { start: new Date(0), end: now, label: 'todo o período' }
    default: return { start: spDay(0), end: now, label: 'hoje' }
  }
}

function salesSummary(state: RafaStoreState, args: any) {
  const range = periodRange(String(args?.periodo || 'hoje'), args?.de, args?.ate)
  const sales = state.sales.filter((sale) => {
    const at = new Date(sale.createdAt).getTime()
    return at >= range.start.getTime() && at < range.end.getTime()
  })
  const total = sales.reduce((sum, sale) => sum + sale.totalCents, 0)
  const profit = sales.reduce((sum, sale) => sum + (sale.grossProfitCents || 0), 0)
  const byProduct = new Map<string, { milli: number; cents: number }>()
  const byPayment = new Map<string, number>()
  for (const sale of sales) {
    const method = sale.payment?.method || 'nao_informado'
    byPayment.set(method, (byPayment.get(method) || 0) + sale.totalCents)
    for (const item of sale.items) {
      const row = byProduct.get(item.productId) || { milli: 0, cents: 0 }
      row.milli += item.quantityMilli
      row.cents += item.lineTotalCents
      byProduct.set(item.productId, row)
    }
  }
  const names = new Map(state.products.map((product) => [product.id, product.name]))
  const top = [...byProduct.entries()].sort((a, b) => b[1].cents - a[1].cents).slice(0, 5)
    .map(([id, row]) => ({ produto: names.get(id) || id, quantidade: units(row.milli), total: money(row.cents) }))
  return {
    periodo: range.label,
    numero_de_vendas: sales.length,
    faturamento: money(total),
    lucro_bruto: money(profit),
    ticket_medio: sales.length ? money(Math.round(total / sales.length)) : money(0),
    por_forma_de_pagamento: Object.fromEntries([...byPayment.entries()].map(([method, cents]) => [method, money(cents)])),
    mais_vendidos: top,
  }
}

function stockSummary(state: RafaStoreState) {
  const products = activeProducts(state)
  const atCost = products.reduce((sum, product) => sum + Math.max(0, product.stockMilli) * Math.round(product.averageCostCents || 0) / 1000, 0)
  const atPrice = products.reduce((sum, product) => sum + Math.max(0, product.stockMilli) * product.priceCents / 1000, 0)
  const low = products.filter((product) => product.stockMilli <= (product.minStockMilli || 0))
  return {
    produtos_cadastrados: products.length,
    unidades_em_estoque: units(products.reduce((sum, product) => sum + Math.max(0, product.stockMilli), 0)),
    valor_em_estoque_pelo_custo: money(Math.round(atCost)),
    valor_em_estoque_pelo_preco_de_venda: money(Math.round(atPrice)),
    zerados: products.filter((product) => product.stockMilli <= 0).length,
    abaixo_do_minimo: low.slice(0, 15).map((product) => ({ nome: product.name, ean: product.barcode, estoque: units(product.stockMilli), minimo: units(product.minStockMilli || 0) })),
  }
}

async function financeScope(storeId: string) {
  const admin = createAdminClient()
  const { data: store } = await admin.from('inventory_v1_stores').select('business_id').eq('id', storeId).maybeSingle()
  return { admin, businessId: store?.business_id ? String(store.business_id) : null }
}

// Busca os dados do banco na hora (Malvo): pede atualização ao banco, espera um pouco
// e puxa contas e movimentações atualizadas antes de responder.
async function refreshFinanceLive(storeId: string, businessId: string | null) {
  const admin = createAdminClient()
  let query = admin.from('balcao_finance_connections').select('provider,provider_item_id,status').eq('provider', 'malvo')
  query = businessId ? query.or(`store_id.eq.${storeId},business_id.eq.${businessId}`) : query.eq('store_id', storeId)
  const { data: connections } = await query
  const items = (connections || []).filter((row) => row.status !== 'disconnected' && row.provider_item_id).map((row) => String(row.provider_item_id))
  if (!items.length) return { conectado: false }

  const startedAt = Date.now()
  const results = await Promise.all(items.map(async (itemId) => {
    let refreshed = false
    try {
      await refreshMalvoItem(itemId)
      for (let waited = 0; waited < 10_000; waited += 2_000) {
        await new Promise((resolve) => setTimeout(resolve, 2_000))
        const item = await getMalvoItem(itemId)
        const updatedAt = item?.lastUpdatedAt ? new Date(item.lastUpdatedAt).getTime() : 0
        if (item?.status === 'UPDATED' && updatedAt >= startedAt - 5_000) { refreshed = true; break }
        if (['LOGIN_ERROR', 'OUTDATED', 'WAITING_USER_INPUT'].includes(String(item?.status))) break
      }
    } catch (error) {
      console.error('Rafa Malvo refresh failed', itemId, error instanceof Error ? error.message : error)
    }
    try {
      await syncMalvoItem({ itemId })
    } catch (error) {
      console.error('Rafa Malvo sync failed', itemId, error instanceof Error ? error.message : error)
      return { itemId, refreshed, synced: false }
    }
    return { itemId, refreshed, synced: true }
  }))
  return {
    conectado: true,
    atualizado_agora: results.some((row) => row.refreshed),
    sincronizado: results.some((row) => row.synced),
  }
}

async function bankBalance(storeId: string) {
  const { admin, businessId } = await financeScope(storeId)
  const live = await refreshFinanceLive(storeId, businessId)
  let query = admin.from('balcao_finance_accounts').select('institution_name,account_name,account_type,balance_cents,status,last_synced_at')
  query = businessId ? query.or(`store_id.eq.${storeId},business_id.eq.${businessId}`) : query.eq('store_id', storeId)
  const { data, error } = await query
  if (error) throw error
  const accounts = (data || []).filter((row) => row.status !== 'disconnected')
  if (!accounts.length) return { contas: [], observacao: 'Nenhuma conta bancária conectada a esta loja.' }
  return {
    consulta_ao_banco: live.conectado
      ? live.atualizado_agora ? 'dados atualizados agora com o banco' : live.sincronizado ? 'banco consultado agora; o banco ainda não liberou movimentações mais novas que as abaixo' : 'não consegui falar com o banco agora; estes são os últimos dados recebidos'
      : 'sem conexão bancária ativa',
    saldo_total: money(accounts.reduce((sum, row) => sum + Number(row.balance_cents || 0), 0)),
    contas: accounts.map((row) => ({
      banco: row.institution_name,
      conta: row.account_name,
      tipo: row.account_type,
      saldo: money(Number(row.balance_cents || 0)),
      atualizado_em: row.last_synced_at ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.last_synced_at)) : 'desconhecida',
    })),
  }
}

async function bankStatement(storeId: string, args: any) {
  const { admin, businessId } = await financeScope(storeId)
  const live = await refreshFinanceLive(storeId, businessId)
  const range = periodRange(String(args?.periodo || '30dias'), args?.de, args?.ate)
  let query = admin.from('balcao_finance_transactions')
    .select('posted_at,amount_cents,description,counterparty_name,category,is_internal_transfer')
    .gte('posted_at', range.start.toISOString())
    .lt('posted_at', range.end.toISOString())
    .order('posted_at', { ascending: false })
    .limit(500)
  query = businessId ? query.or(`store_id.eq.${storeId},business_id.eq.${businessId}`) : query.eq('store_id', storeId)
  const { data, error } = await query
  if (error) throw error
  const tipo = String(args?.tipo || 'todos')
  const search = args?.busca ? normalizeText(String(args.busca)) : ''
  const rows = (data || []).filter((row) => !row.is_internal_transfer).filter((row) => {
    const amount = Number(row.amount_cents || 0)
    if (tipo === 'entradas' && amount <= 0) return false
    if (tipo === 'saidas' && amount >= 0) return false
    if (search && !normalizeText(`${row.description || ''} ${row.counterparty_name || ''} ${row.category || ''}`).includes(search)) return false
    return true
  })
  const inflow = rows.filter((row) => Number(row.amount_cents) > 0).reduce((sum, row) => sum + Number(row.amount_cents), 0)
  const outflow = rows.filter((row) => Number(row.amount_cents) < 0).reduce((sum, row) => sum + Number(row.amount_cents), 0)
  const byCategory = new Map<string, number>()
  for (const row of rows) if (Number(row.amount_cents) < 0) byCategory.set(row.category || 'sem categoria', (byCategory.get(row.category || 'sem categoria') || 0) + Number(row.amount_cents))
  const byOrigin = new Map<string, number>()
  for (const row of rows) {
    if (Number(row.amount_cents) <= 0) continue
    const origin = String(row.counterparty_name || row.description || 'não identificado').slice(0, 60)
    byOrigin.set(origin, (byOrigin.get(origin) || 0) + Number(row.amount_cents))
  }
  return {
    consulta_ao_banco: live.conectado
      ? live.atualizado_agora ? 'dados atualizados agora com o banco' : live.sincronizado ? 'banco consultado agora' : 'não consegui falar com o banco agora; últimos dados recebidos'
      : 'sem conexão bancária ativa',
    periodo: range.label,
    lancamentos: rows.length,
    entradas_por_origem: [...byOrigin.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([origem, cents]) => ({ origem, total: money(cents) })),
    total_entradas: money(inflow),
    total_saidas: money(Math.abs(outflow)),
    resultado: money(inflow + outflow),
    maiores_gastos_por_categoria: [...byCategory.entries()].sort((a, b) => a[1] - b[1]).slice(0, 5).map(([categoria, cents]) => ({ categoria, total: money(Math.abs(cents)) })),
    ultimos: rows.slice(0, 10).map((row) => ({
      data: String(row.posted_at).slice(0, 10),
      valor: money(Number(row.amount_cents)),
      descricao: row.counterparty_name || row.description,
      categoria: row.category,
    })),
  }
}

// ---------- Ferramentas (escrita → sempre proposta com Sim/Não) ----------

function cents(value: unknown) {
  const number = typeof value === 'string' ? Number(value.replace(/[^\d,.-]/g, '').replace(',', '.')) : Number(value)
  return Number.isFinite(number) ? Math.round(number * 100) : NaN
}

function milli(value: unknown) {
  const number = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value)
  return Number.isFinite(number) ? Math.round(number * 1000) : NaN
}

export function buildRafaChanges(state: RafaStoreState, items: any[]): { changes: RafaChange[] } | { error: string } {
  if (!Array.isArray(items) || !items.length) return { error: 'Nenhuma alteração informada.' }
  const changes: RafaChange[] = []
  for (const item of items) {
    const tipo = String(item?.tipo || '')
    if (tipo === 'cadastrar') {
      const barcode = String(item.ean || '').replace(/\D/g, '')
      const name = String(item.nome || '').trim().slice(0, 120)
      const priceCents = cents(item.preco_reais)
      const costCents = cents(item.custo_reais)
      const stockMilli = item.estoque_inicial == null ? 0 : milli(item.estoque_inicial)
      if (!isValidGtin(barcode)) return { error: `EAN inválido para "${name || 'produto novo'}". Peça o código de barras correto.` }
      if (!name) return { error: 'Falta o nome do produto novo.' }
      if (!(priceCents > 0)) return { error: `Falta o preço de venda de "${name}".` }
      if (!(costCents > 0)) return { error: `Falta o custo de compra de "${name}".` }
      if (!Number.isInteger(stockMilli) || stockMilli < 0) return { error: `Estoque inicial inválido para "${name}".` }
      const existing = state.products.find((product) => product.barcode === barcode)
      if (existing && !existing.deletedAt) return { error: `Já existe um produto com EAN ${barcode}: ${existing.name} (id ${existing.id}).` }
      changes.push({
        kind: 'cadastrar',
        productId: existing?.id || randomUUID(),
        barcode,
        name,
        unit: String(item.unidade || 'UN').toUpperCase() === 'KG' ? 'KG' : 'UN',
        priceCents,
        costCents,
        stockMilli,
        reactivate: Boolean(existing),
      })
      continue
    }

    const product = state.products.find((row) => row.id === String(item?.produto_id || '') && !row.deletedAt)
    if (!product) return { error: `Produto ${item?.produto_id || ''} não encontrado. Use buscar_produtos e passe o id exato.` }
    if (tipo === 'preco') {
      const newPriceCents = cents(item.novo_preco_reais)
      if (!(newPriceCents > 0)) return { error: `Preço inválido para ${product.name}.` }
      changes.push({ kind: 'preco', productId: product.id, expectedPriceCents: product.priceCents, newPriceCents })
    } else if (tipo === 'estoque') {
      const newStockMilli = milli(item.novo_estoque)
      if (!Number.isInteger(newStockMilli) || newStockMilli < 0) return { error: `Estoque inválido para ${product.name}.` }
      changes.push({ kind: 'estoque', productId: product.id, expectedStockMilli: product.stockMilli, newStockMilli })
    } else if (tipo === 'entrada') {
      const quantityMilli = milli(item.quantidade)
      const unitCostCents = item.custo_unitario_reais == null ? Math.round(product.averageCostCents || 0) : cents(item.custo_unitario_reais)
      if (!(quantityMilli > 0)) return { error: `Quantidade de entrada inválida para ${product.name}.` }
      if (!(unitCostCents > 0)) return { error: `Falta o custo unitário da entrada de ${product.name}.` }
      changes.push({ kind: 'entrada', productId: product.id, expectedStockMilli: product.stockMilli, quantityMilli, unitCostCents })
    } else if (tipo === 'venda') {
      const quantityMilli = milli(item.quantidade)
      if (!(quantityMilli > 0)) return { error: `Quantidade vendida inválida para ${product.name}.` }
      const method = ['pix', 'card', 'cash'].includes(String(item.pagamento)) ? item.pagamento as 'pix' | 'card' | 'cash' : undefined
      changes.push({ kind: 'venda', productId: product.id, expectedStockMilli: product.stockMilli, quantityMilli, ...(method ? { paymentMethod: method } : {}) })
    } else if (tipo === 'remover') {
      changes.push({ kind: 'remover', productId: product.id, expectedStockMilli: product.stockMilli })
    } else {
      return { error: `Tipo de alteração desconhecido: ${tipo}.` }
    }
  }
  return { changes }
}

// ---------- Definição das ferramentas para o modelo ----------

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'buscar_produtos',
      description: 'Busca produtos da loja por nome, marca ou EAN. Retorna id, nome, EAN, preço, custo e estoque. Use antes de responder sobre um produto ou de propor alteração.',
      parameters: { type: 'object', properties: { termo: { type: 'string', description: 'nome, marca ou código de barras. Vazio lista os primeiros produtos.' } }, required: ['termo'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resumo_estoque',
      description: 'Visão geral do estoque: quantidade de produtos, valor em estoque, zerados e abaixo do mínimo.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vendas',
      description: 'Resumo de vendas registradas no Balcão em um período: faturamento, número de vendas, lucro bruto, mais vendidos.',
      parameters: {
        type: 'object',
        properties: {
          periodo: { type: 'string', enum: ['hoje', 'ontem', 'semana', 'mes', '30dias', 'tudo'] },
          de: { type: 'string', description: 'data inicial AAAA-MM-DD (opcional)' },
          ate: { type: 'string', description: 'data final AAAA-MM-DD (opcional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'saldo_banco',
      description: 'Saldo atual das contas bancárias conectadas (Open Finance) da loja.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'extrato',
      description: 'Movimentações bancárias no período: entradas, saídas, gastos por categoria e últimos lançamentos.',
      parameters: {
        type: 'object',
        properties: {
          periodo: { type: 'string', enum: ['hoje', 'ontem', 'semana', 'mes', '30dias'] },
          de: { type: 'string' },
          ate: { type: 'string' },
          tipo: { type: 'string', enum: ['todos', 'entradas', 'saidas'] },
          busca: { type: 'string', description: 'filtra por descrição, favorecido ou categoria' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'trocar_loja',
      description: 'Mostra ao lojista a lista de lojas ligadas a este número para ele escolher com qual falar. Use quando pedirem para trocar, mudar ou conectar outra loja/mercadinho.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gerar_link',
      description: 'Gera o link do Balcão: vender (caixa com câmera), ler-codigo (ler um produto e ver/editar o perfil), prateleira (lista de todos os produtos com busca) ou entrada (subir estoque por código do produto ou nota fiscal).',
      parameters: { type: 'object', properties: { fluxo: { type: 'string', enum: ['vender', 'ler-codigo', 'prateleira', 'entrada'] } }, required: ['fluxo'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propor_alteracoes',
      description: 'Propõe alterações na loja. NÃO aplica: o lojista recebe o resumo e confirma com Sim/Não. Use ids vindos de buscar_produtos. Valores em reais (ex.: 7.5), quantidades em unidades (ex.: 12).',
      parameters: {
        type: 'object',
        properties: {
          alteracoes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tipo: { type: 'string', enum: ['preco', 'estoque', 'entrada', 'venda', 'cadastrar', 'remover'] },
                produto_id: { type: 'string', description: 'obrigatório exceto em cadastrar' },
                novo_preco_reais: { type: 'number' },
                novo_estoque: { type: 'number', description: 'estoque final desejado (tipo estoque)' },
                quantidade: { type: 'number', description: 'unidades (entrada ou venda)' },
                custo_unitario_reais: { type: 'number' },
                pagamento: { type: 'string', enum: ['pix', 'card', 'cash'] },
                ean: { type: 'string', description: 'código de barras (cadastrar)' },
                nome: { type: 'string', description: 'nome do produto (cadastrar)' },
                preco_reais: { type: 'number', description: 'preço de venda (cadastrar)' },
                custo_reais: { type: 'number', description: 'custo de compra (cadastrar)' },
                estoque_inicial: { type: 'number' },
                unidade: { type: 'string', enum: ['UN', 'KG'] },
              },
              required: ['tipo'],
            },
          },
        },
        required: ['alteracoes'],
      },
    },
  },
]

function systemPrompt(storeName: string, otherStores: number) {
  const today = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' }).format(new Date())
  return [
    `Você é a Rafa, assistente da loja "${storeName}" no WhatsApp, criada pela RPG Capital. Agora é ${today} (horário de Brasília).`,
    otherStores > 0 ? `Este número também tem acesso a ${otherStores} outra(s) loja(s); para trocar, use a ferramenta trocar_loja.` : 'Este número só tem acesso a esta loja.',
    '',
    'COMO PENSAR (faça isso antes de cada resposta):',
    '1. Descubra o que a pessoa quer de verdade. As mensagens chegam com erros de digitação e de transcrição de voz: leia pelo som e pelo contexto da conversa (ex.: "mi dar de loja" = "mudar de loja", "qnt" = "quanto").',
    '2. Escolha a ferramenta que responde exatamente essa pergunta. Nunca responda outra coisa no lugar: se perguntaram de loja, não fale de banco; se perguntaram de estoque, não fale de vendas.',
    '3. Se depois de pensar ainda estiver em dúvida entre dois sentidos, pergunte em uma linha qual deles, em vez de chutar.',
    '4. Confira: a resposta usa só números que vieram das ferramentas e responde a pergunta feita? Se não, corrija antes de enviar.',
    '',
    'REGRAS:',
    'Português do Brasil, simples e direto, como uma funcionária de confiança. Até 6 linhas, texto corrido ou lista curta com "•". Sem markdown, sem asteriscos, sem títulos. Não assine a mensagem.',
    'Nunca invente números, produtos, preços, estoques ou saldos. Se a ferramenta não trouxer o dado, diga que não tem essa informação.',
    'Ao citar produto, use o nome completo e o EAN como vieram da ferramenta. Valores sempre em reais (R$).',
    'Saldo e extrato: as ferramentas consultam o banco na hora. Responda com o valor e o banco. Só mencione data ou atraso se a ferramenta disser que não conseguiu atualizar com o banco.',
    '"Quanto ganhei/entrou hoje": use extrato com periodo hoje e tipo entradas, e diga o total e de onde veio (entradas_por_origem).',
    'Links: se pedirem para abrir ou ir para vendas/caixa, ler código, prateleira/estoque ou subir estoque, mande o link com gerar_link (uma linha explicando + o link).',
    'Se pedirem para "ver o estoque" sem dizer como, pergunte em uma linha: "Te conto aqui ou te mando o link da prateleira?".',
    'Se a pessoa mandar só um número de 1 a 4 sem contexto, é o menu: 1 = vender, 2 = ler código, 3 = prateleira, 4 = subir estoque. Chame gerar_link com o fluxo certo.',
    'Consultas (estoque, preço, vendas, saldo, extrato), links e troca de loja: faça direto, sem pedir confirmação.',
    'Alterações (preço, estoque, entrada, venda, cadastrar ou remover produto): busque o produto e chame propor_alteracoes. Nunca diga que já alterou: quem confirma é o lojista, com sim ou não.',
    'Se a busca achar mais de um produto possível para uma alteração, pergunte qual é, listando nome e EAN.',
    'Se faltar dado (preço, custo, EAN para cadastrar), pergunte só o que falta.',
    `Se a pessoa só cumprimentar (oi, olá, bom dia, eai...), responda exatamente: "Oi! Esse número está registrado na loja ${storeName}. Como posso te ajudar hoje?"`,
    'ÁUDIO: se a mensagem começar com [ÁUDIO transcrito], comece a resposta com "Entendi: " e um resumo do pedido em uma frase (ex.: "Entendi: você quer saber quanto vendeu hoje."). Depois responda ou faça o que foi pedido. A transcrição pode ter erros; leia pelo sentido.',
    'IMAGEM/ARQUIVO: se vier [IMAGEM: ...] ou [ARQUIVO: ...], diga em uma linha o que você leu (ex.: "Li sua lista com 8 itens."). Se o lojista pediu algo (ou a legenda indica), faça: busque cada produto com buscar_produtos e chame propor_alteracoes de uma vez com todos os itens entendidos. Se não pediu nada, resuma o conteúdo e pergunte o que ele quer fazer (ex.: "Quer que eu dê entrada desses itens no estoque?").',
    'Item ambíguo (ex.: "papel higiênico 12 rolos" e a loja tem 3 marcas): não chute. Liste as opções com nome e EAN e pergunte qual é. Item que não existe na loja: diga que não achou e pergunte se quer cadastrar (precisa de EAN, preço e custo). Nunca invente item, quantidade ou preço que não esteja no arquivo.',
    'Se perguntarem quem você é ou o que faz: diga que é a Rafa, da RPG Capital, e que consulta estoque, preços, vendas e banco da loja, e muda preço, estoque e produtos com confirmação.',
    'Se o assunto não tiver a ver com a loja, responda em uma linha e volte para a loja.',
  ].join('\n')
}

// Catálogo compacto no prompt: a maioria das perguntas de preço/estoque é respondida
// sem chamar ferramenta (uma ida ao modelo em vez de duas ou três).
const CATALOG_LIMIT = 300

function catalogBlock(state: RafaStoreState) {
  const products = activeProducts(state)
  if (!products.length) return 'CATÁLOGO DA LOJA: nenhum produto cadastrado.'
  if (products.length > CATALOG_LIMIT) return `CATÁLOGO DA LOJA: ${products.length} produtos (grande demais para listar aqui; use buscar_produtos).`
  const lines = products.map((product) => [
    product.id,
    product.name,
    product.barcode,
    money(product.priceCents),
    money(Math.round(product.averageCostCents || 0)),
    units(product.stockMilli),
    units(product.minStockMilli || 0),
  ].join(' | '))
  return [
    `CATÁLOGO DA LOJA (${products.length} produtos, dados de agora). Colunas: id | nome | EAN | preço | custo médio | estoque | estoque mínimo`,
    ...lines,
    'Use este catálogo para responder preço e estoque direto e para pegar o id ao propor alterações (não precisa chamar buscar_produtos).',
  ].join('\n')
}

// ---------- Histórico curto da conversa ----------

async function recentHistory(waId: string) {
  const admin = createAdminClient()
  const wa = normalizePhone(waId)
  const since = new Date(Date.now() - 6 * 3600_000).toISOString()
  const [{ data: inbound }, { data: outbound }] = await Promise.all([
    admin.from('whatsapp_inbound_messages').select('text_body,transcript,received_at').eq('from_phone', wa).gte('received_at', since).order('received_at', { ascending: false }).limit(8),
    admin.from('wa_outbox').select('payload,created_at').eq('to_phone', wa).gte('created_at', since).order('created_at', { ascending: false }).limit(8),
  ])
  const turns = [
    ...(inbound || []).map((row) => ({ at: String(row.received_at), role: 'user' as const, content: String(row.transcript || row.text_body || '').slice(0, 600) })),
    ...(outbound || []).map((row) => ({ at: String(row.created_at), role: 'assistant' as const, content: String((row.payload as any)?.body || '').slice(0, 600) })),
  ].filter((turn) => turn.content.trim())
  turns.sort((a, b) => a.at.localeCompare(b.at))
  return turns.slice(-10).map(({ role, content }) => ({ role, content }))
}

// ---------- Loop do agente ----------

async function groqChat(storeId: string, waId: string, messages: any[], maxTokens = 2500) {
  const key = process.env.GROQ_API_KEY?.trim()
  if (!key) throw new Error('GROQ_API_KEY is not configured')
  const response = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: RAFA_AGENT_MODEL,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.2,
      reasoning_effort: 'medium',
      max_completion_tokens: maxTokens,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  })
  const json = await response.json().catch(() => null) as any
  if (!response.ok) throw new Error(json?.error?.message || `Groq HTTP ${response.status}`)
  const usage = json?.usage || {}
  await recordAiUsage({
    storeId,
    waId,
    operation: 'rafa_agent',
    model: RAFA_AGENT_MODEL,
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    estimatedCostUsd: (Number(usage.prompt_tokens || 0) * 0.15 + Number(usage.completion_tokens || 0) * 0.60) / 1_000_000,
  }).catch(() => {})
  return json?.choices?.[0]?.message as { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } | undefined
}

// Limpa a saída do modelo: sem markdown, sem assinatura e sem texto repetido em dobro.
export function cleanReply(text: string) {
  let out = text
    .replace(/\*\*|__|`/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\s*—\s*Rafa/gu, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
  const doubled = out.match(/^([\s\S]{10,}?)\s*\1$/)
  if (doubled) out = doubled[1].trim()
  const paragraphs = out.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
  out = paragraphs.filter((paragraph, index) => paragraphs.indexOf(paragraph) === index).join('\n\n')
  return out.replace(/\n{3,}/g, '\n\n').trim()
}

export type RafaAgentOutcome = 'replied' | 'confirmation' | 'budget' | 'error'

export type RafaAgentSource = 'text' | 'audio' | 'image' | 'document'

// Monta a mensagem do lojista para o modelo, marcando de onde veio (áudio, imagem, arquivo).
export function agentUserContent(input: { text: string; source?: RafaAgentSource; attachment?: { label: string; content: string } }) {
  const text = input.text.trim()
  if (input.source === 'audio') return `[ÁUDIO transcrito] ${text.slice(0, 2000)}`
  if (input.attachment) {
    const tag = input.source === 'image' ? 'IMAGEM' : 'ARQUIVO'
    const caption = text ? `Mensagem junto: ${text.slice(0, 500)}\n\n` : 'O lojista mandou só o arquivo, sem texto.\n\n'
    return `${caption}[${tag}: ${input.attachment.label}]\n${input.attachment.content.slice(0, 12_000)}`
  }
  return text.slice(0, 2000)
}

export async function runRafaAgent(input: { waId: string; storeId: string; text: string; inReplyTo?: string; source?: RafaAgentSource; attachment?: { label: string; content: string } }): Promise<RafaAgentOutcome> {
  const [budget, loaded, history, stores] = await Promise.all([
    rafaAiBudgetAvailable(input.storeId),
    loadRafaStore(input.storeId),
    recentHistory(input.waId).catch(() => []),
    phoneStores(input.waId).catch(() => []),
  ])
  if (!budget.allowed) return 'budget'
  const { store, state } = loaded
  const otherStores = stores.filter((item) => item.id !== input.storeId).length
  const messages: any[] = [
    { role: 'system', content: `${systemPrompt(store.displayName || 'sua loja', otherStores)}\n\n${catalogBlock(state)}` },
    ...history,
    { role: 'user', content: agentUserContent(input) },
  ]
  const maxTokens = input.attachment ? 5000 : 2500

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const reply = await groqChat(input.storeId, input.waId, messages, maxTokens)
    if (!reply) throw new Error('rafa_agent_empty')
    const calls = reply.tool_calls || []

    if (!calls.length) {
      const text = String(reply.content || '').trim()
      if (!text) throw new Error('rafa_agent_empty')
      const body = cleanReply(text)
      // O menu vem sempre depois da resposta (mensagem separada).
      const sent = await sendText(input.waId, body, { inReplyTo: input.inReplyTo })
      if (!sent.ok) throw new Error(sent.error)
      return 'replied'
    }

    messages.push({ role: 'assistant', content: reply.content || '', tool_calls: calls })
    for (const call of calls) {
      let args: any = {}
      try { args = JSON.parse(call.function.arguments || '{}') } catch {}
      let result: unknown
      try {
        switch (call.function.name) {
          case 'buscar_produtos': {
            const found = searchStoreProducts(state, String(args.termo || ''))
            result = found.length ? { produtos: found.map(productView) } : { produtos: [], observacao: 'Nenhum produto encontrado com esse termo.' }
            break
          }
          case 'resumo_estoque': result = stockSummary(state); break
          case 'vendas': result = salesSummary(state, args); break
          case 'saldo_banco': result = await bankBalance(input.storeId); break
          case 'extrato': result = await bankStatement(input.storeId, args); break
          case 'trocar_loja': {
            if (stores.length < 2) { result = { observacao: 'Este número só tem acesso a uma loja.', loja_atual: store.displayName }; break }
            const sent = await askStorePick(input.waId, stores, input.inReplyTo)
            if (!sent.ok) throw new Error(sent.error)
            return 'replied'
          }
          case 'gerar_link': {
            const fluxo = String(args.fluxo || '')
            if (!isBalcaoFlow(fluxo)) { result = { erro: 'fluxo inválido' }; break }
            // O link sai com texto fixo (o modelo não reescreve a URL).
            const link = await createBalcaoDeepLink({ waId: input.waId, storeId: input.storeId, fluxo })
            const sent = await sendText(input.waId, `${FLOW_HINT[fluxo]}\n${link.url}`, { inReplyTo: input.inReplyTo })
            if (!sent.ok) throw new Error(sent.error)
            return 'replied'
          }
          case 'propor_alteracoes': {
            const built = buildRafaChanges(state, args.alteracoes)
            if ('error' in built) { result = { erro: built.error }; break }
            const sent = await askRafaConfirmation({ waId: input.waId, storeId: input.storeId, changes: built.changes, state, inReplyTo: input.inReplyTo })
            if (!sent.ok) throw new Error(sent.error)
            return 'confirmation'
          }
          default: result = { erro: 'ferramenta desconhecida' }
        }
      } catch (error) {
        result = { erro: error instanceof Error ? error.message : 'falha na ferramenta' }
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12_000) })
    }
  }

  const sent = await sendText(input.waId, 'Não consegui fechar essa resposta agora. Me pergunta de outro jeito?\n— Rafa', { inReplyTo: input.inReplyTo })
  if (!sent.ok) throw new Error(sent.error)
  return 'error'
}
