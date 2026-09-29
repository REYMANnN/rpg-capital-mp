import { randomUUID } from 'node:crypto'

import { extractRafaActions } from '@/lib/rafa-ai'
import { askRafaConfirmation } from '@/lib/rafa-confirm'
import { applyRafaChanges, loadRafaStore, persistRafaState, type RafaChange, type RafaStoreState } from '@/lib/inventory/rafa-store'
import { batchPriceRequestMessage, belowCostWarning, parseBatchPrices, parsePriceAnswer, priceQuestion, registeredMessage } from '@/lib/rafa-price-flow'
import { rememberSupplierProduct } from '@/lib/rafa-products'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendText } from '@/lib/whatsapp'
import { normalizePhone } from '@/lib/whatsapp-evolution'

const QUESTION_TTL_MS = 24 * 3600_000

type Row = {
  id: string
  store_id: string
  wa_id: string
  barcode: string
  name: string
  unit: string
  quantity_milli: number
  cost_cents: number
  proposed_price_cents: number | null
  supplier_cnpj: string | null
  supplier_code: string | null
}

const COLUMNS = 'id,store_id,wa_id,barcode,name,unit,quantity_milli,cost_cents,proposed_price_cents,supplier_cnpj,supplier_code'

function toRow(data: Record<string, unknown>): Row {
  return {
    id: String(data.id), store_id: String(data.store_id), wa_id: String(data.wa_id),
    barcode: String(data.barcode), name: String(data.name), unit: String(data.unit || 'UN'),
    quantity_milli: Number(data.quantity_milli), cost_cents: Number(data.cost_cents),
    proposed_price_cents: data.proposed_price_cents == null ? null : Number(data.proposed_price_cents),
    supplier_cnpj: data.supplier_cnpj ? String(data.supplier_cnpj) : null,
    supplier_code: data.supplier_code ? String(data.supplier_code) : null,
  }
}

function batchEnabled() {
  return process.env.RAFA_PRICE_BATCH !== 'off'
}

export async function activePriceQuestion(waId: string): Promise<Row | null> {
  const { data } = await createAdminClient().from('rafa_pending_products')
    .select(COLUMNS)
    .eq('wa_id', normalizePhone(waId))
    .eq('current', true)
    .eq('status', 'aguardando_preco')
    .gte('asked_at', new Date(Date.now() - QUESTION_TTL_MS).toISOString())
    .order('asked_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? toRow(data) : null
}

async function remaining(storeId: string) {
  const { data } = await createAdminClient().from('rafa_pending_products')
    .select(COLUMNS).eq('store_id', storeId).eq('status', 'aguardando_preco')
    .order('created_at', { ascending: true }).limit(60)
  return (data || []).map(toRow)
}

async function skippedCount(storeId: string) {
  const { count } = await createAdminClient().from('rafa_pending_products')
    .select('id', { count: 'exact', head: true }).eq('store_id', storeId).eq('status', 'pulado')
  return count || 0
}

async function nextQuestionText(waId: string, storeId: string, intro: boolean) {
  const admin = createAdminClient()
  await admin.from('rafa_pending_products').update({ current: false }).eq('wa_id', normalizePhone(waId)).eq('current', true)
  const rows = await remaining(storeId)
  if (!rows.length) {
    const skipped = await skippedCount(storeId)
    return { text: skipped ? `Pronto por agora! ${skipped} produto(s) ficaram pra depois. Quando quiser, é só mandar "continuar preços".` : 'Pronto! Todos os produtos novos da nota estão com preço e no estoque.', asking: false }
  }
  const row = rows[0]
  await admin.from('rafa_pending_products').update({ current: true, wa_id: normalizePhone(waId), asked_at: new Date().toISOString(), proposed_price_cents: null }).eq('id', row.id)
  return { text: priceQuestion(row, rows.length, intro ? { total: rows.length } : undefined), asking: true }
}

export async function startPriceQuestions(waId: string, storeId: string) {
  if (await activePriceQuestion(waId)) return false
  const rows = await remaining(storeId)
  if (!rows.length) return false

  if (batchEnabled()) {
    const admin = createAdminClient()
    const ids = rows.map((row) => row.id)
    await admin.from('rafa_pending_products').update({
      current: true,
      wa_id: normalizePhone(waId),
      asked_at: new Date().toISOString(),
      proposed_price_cents: null,
    }).in('id', ids)
    const sent = await sendText(waId, `${batchPriceRequestMessage(rows)}\n— Rafa`, { noMenu: true })
    if (!sent.ok) throw new Error(sent.error)
    return true
  }

  const next = await nextQuestionText(waId, storeId, true)
  const sent = await sendText(waId, `${next.text}\n— Rafa`, { noMenu: next.asking })
  if (!sent.ok) throw new Error(sent.error)
  return true
}

function changesForPrice(row: Row, priceCents: number, state: RafaStoreState): RafaChange[] {
  const existing = state.products.find((product) => product.barcode === row.barcode && !product.deletedAt)
  const deleted = state.products.find((product) => product.barcode === row.barcode && product.deletedAt)
  return existing
    ? [
        { kind: 'entrada', productId: existing.id, expectedStockMilli: existing.stockMilli, quantityMilli: row.quantity_milli, unitCostCents: row.cost_cents, reason: 'nota fiscal' },
        ...(existing.priceCents !== priceCents ? [{ kind: 'preco' as const, productId: existing.id, expectedPriceCents: existing.priceCents, newPriceCents: priceCents }] : []),
      ]
    : [{
        kind: 'cadastrar',
        productId: deleted?.id || randomUUID(),
        barcode: row.barcode,
        name: row.name,
        unit: row.unit === 'KG' ? 'KG' : 'UN',
        priceCents,
        costCents: row.cost_cents,
        stockMilli: row.quantity_milli,
        reactivate: Boolean(deleted),
        reason: 'nota fiscal',
      }]
}

async function register(row: Row, priceCents: number, waId: string) {
  const { state } = await loadRafaStore(row.store_id)
  const changes = changesForPrice(row, priceCents, state)
  const { state: after, audit } = applyRafaChanges(state, changes, { waId })
  await persistRafaState({ storeId: row.store_id, waId, before: state, after, audit })
  await createAdminClient().from('rafa_pending_products').update({
    status: 'cadastrado', current: false, price_cents: priceCents, updated_at: new Date().toISOString(),
  }).eq('id', row.id)
  if (row.supplier_cnpj && row.supplier_code) {
    await rememberSupplierProduct({ supplierCnpj: row.supplier_cnpj, supplierCode: row.supplier_code, description: row.name, barcode: row.barcode }).catch(() => {})
  }
}

function money(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function shortName(name: string) {
  return name.split(/\s+/).slice(0, 4).join(' ')
}

function matchPendingReference(reference: string, rows: Row[]) {
  const norm = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
  const words = norm(reference).split(' ').filter((word) => word.length >= 3)
  const matches = rows.map((row, index) => ({ index, name: norm(row.name) })).filter((row) => words.some((word) => row.name.includes(word)))
  return matches.length === 1 ? matches[0].index : null
}

async function aiBatchFallback(waId: string, rows: Row[], text: string) {
  if (!rows.length) return null
  const extracted = await extractRafaActions({
    storeId: rows[0].store_id,
    waId,
    text,
    intent: 'alterar_preco',
    products: rows.map((row) => ({ id: row.id, name: row.name, barcode: row.barcode, priceCents: 0, stockMilli: row.quantity_milli, averageCostCents: row.cost_cents })),
    history: [],
  })
  const prices: Array<{ index: number; cents: number }> = []
  for (const action of extracted.actions || []) {
    if (action.tipo !== 'preco' || !Number.isInteger(action.valor_novo_centavos)) continue
    const index = matchPendingReference(String(action.referencia_produto || ''), rows)
    if (index !== null) prices.push({ index, cents: Number(action.valor_novo_centavos) })
  }
  return prices.length ? { prices, skipped: [] as number[] } : null
}

async function handleBatch(waId: string, text: string, inReplyTo?: string): Promise<boolean> {
  const active = await activePriceQuestion(waId)
  if (!active) return false
  const rows = await remaining(active.store_id)
  if (!rows.length) return false

  let parsed = parseBatchPrices(text, rows)
  if (!parsed) {
    try { parsed = await aiBatchFallback(waId, rows, text) } catch { parsed = null }
    if (!parsed) return false
  }

  const admin = createAdminClient()
  for (const index of parsed.skipped) {
    const row = rows[index]
    if (row) await admin.from('rafa_pending_products').update({ status: 'pulado', current: false, updated_at: new Date().toISOString() }).eq('id', row.id)
  }

  const saved: Array<{ row: Row; cents: number }> = []
  const below: Array<{ row: Row; cents: number }> = []
  for (const entry of parsed.prices) {
    const row = rows[entry.index]
    if (!row) continue
    if (entry.cents < row.cost_cents) below.push({ row, cents: entry.cents })
    else {
      await register(row, entry.cents, waId)
      saved.push({ row, cents: entry.cents })
    }
  }

  const savedText = saved.length
    ? `Salvei ${saved.length}: ${saved.map(({ row, cents }) => `${shortName(row.name)} ${money(cents)}`).join(' · ')}.`
    : ''

  if (below.length) {
    const { state } = await loadRafaStore(active.store_id)
    const changes = below.flatMap(({ row, cents }) => changesForPrice(row, cents, state))
    await Promise.all(below.map(({ row, cents }) => admin.from('rafa_pending_products').update({ proposed_price_cents: cents }).eq('id', row.id)))
    const warnings = below.map(({ row, cents }) => `${shortName(row.name)} a ${money(cents)} fica abaixo do custo (${money(row.cost_cents)})`).join(' · ')
    const message = [savedText, `${warnings}. Confirma?`].filter(Boolean).join(' ')
    const result = await askRafaConfirmation({ waId, storeId: active.store_id, changes, state, inReplyTo, message })
    if (!result.ok) throw new Error(result.error)
    return true
  }

  const left = await remaining(active.store_id)
  const missing = left.filter((row) => !parsed.skipped.includes(rows.findIndex((candidate) => candidate.id === row.id)))
  const body = savedText
    ? missing.length ? `${savedText} Faltou: ${missing.slice(0, 6).map((row) => shortName(row.name)).join(', ')}.` : savedText
    : parsed.skipped.length ? `Deixei ${parsed.skipped.length} produto(s) pra depois.` : ''
  if (!body) return false
  const sent = await sendText(waId, `${body}\n— Rafa`, { inReplyTo, noMenu: missing.length > 0 })
  if (!sent.ok) throw new Error(sent.error)
  return true
}

// Resposta do lojista à lista/pergunta de preço. true = tratada aqui (não vai para a IA).
export async function handlePriceAnswer(waId: string, text: string, inReplyTo?: string): Promise<boolean> {
  if (batchEnabled()) return handleBatch(waId, text, inReplyTo)

  const answer = parsePriceAnswer(text)
  if (!answer) return false
  const admin = createAdminClient()
  const reply = async (body: string, asking: boolean) => {
    const sent = await sendText(waId, `${body}\n— Rafa`, { inReplyTo, noMenu: asking })
    if (!sent.ok) throw new Error(sent.error)
  }

  const row = await activePriceQuestion(waId)
  if (!row) {
    if (answer.kind !== 'resume') return false
    const { data } = await admin.from('rafa_pending_products').select('store_id')
      .eq('wa_id', normalizePhone(waId)).in('status', ['pulado', 'aguardando_preco']).limit(1).maybeSingle()
    if (!data?.store_id) return false
    await admin.from('rafa_pending_products').update({ status: 'aguardando_preco' }).eq('store_id', data.store_id).eq('status', 'pulado')
    return startPriceQuestions(waId, String(data.store_id))
  }

  if (answer.kind === 'resume') {
    const next = await nextQuestionText(waId, row.store_id, false)
    await reply(next.text, next.asking)
    return true
  }
  if (answer.kind === 'stop') {
    await admin.from('rafa_pending_products').update({ current: false }).eq('id', row.id)
    const left = (await remaining(row.store_id)).length
    await reply(`Tudo bem, paro por aqui. Faltam ${left} produto(s). Quando quiser, manda "continuar preços".`, false)
    return true
  }
  if (answer.kind === 'skip') {
    await admin.from('rafa_pending_products').update({ status: 'pulado', current: false }).eq('id', row.id)
    const next = await nextQuestionText(waId, row.store_id, false)
    await reply(`Beleza, ${row.name} fica pra depois.\n\n${next.text}`, next.asking)
    return true
  }

  if (answer.cents < row.cost_cents && row.proposed_price_cents !== answer.cents) {
    await admin.from('rafa_pending_products').update({ proposed_price_cents: answer.cents }).eq('id', row.id)
    await reply(belowCostWarning(row, answer.cents), true)
    return true
  }

  await register(row, answer.cents, waId)
  const next = await nextQuestionText(waId, row.store_id, false)
  await reply(`${registeredMessage(row, answer.cents)}\n\n${next.text}`, next.asking)
  return true
}
