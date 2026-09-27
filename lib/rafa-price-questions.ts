import { randomUUID } from 'node:crypto'

import { applyRafaChanges, loadRafaStore, persistRafaState, type RafaChange } from '@/lib/inventory/rafa-store'
import { belowCostWarning, parsePriceAnswer, priceQuestion, registeredMessage } from '@/lib/rafa-price-flow'
import { rememberSupplierProduct } from '@/lib/rafa-products'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendText } from '@/lib/whatsapp'
import { normalizePhone } from '@/lib/whatsapp-evolution'

// Produtos novos da nota: a Rafa pergunta o preço de venda de um por vez.
// A pergunta atual fica marcada (current=true) em rafa_pending_products, por número de WhatsApp.

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
    id: String(data.id),
    store_id: String(data.store_id),
    wa_id: String(data.wa_id),
    barcode: String(data.barcode),
    name: String(data.name),
    unit: String(data.unit || 'UN'),
    quantity_milli: Number(data.quantity_milli),
    cost_cents: Number(data.cost_cents),
    proposed_price_cents: data.proposed_price_cents == null ? null : Number(data.proposed_price_cents),
    supplier_cnpj: data.supplier_cnpj ? String(data.supplier_cnpj) : null,
    supplier_code: data.supplier_code ? String(data.supplier_code) : null,
  }
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
    .select(COLUMNS)
    .eq('store_id', storeId)
    .eq('status', 'aguardando_preco')
    .order('created_at', { ascending: true })
    .limit(60)
  return (data || []).map(toRow)
}

async function skippedCount(storeId: string) {
  const { count } = await createAdminClient().from('rafa_pending_products')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('status', 'pulado')
  return count || 0
}

// Monta a próxima pergunta (ou o fechamento). Não envia: quem chama junta com a resposta anterior.
async function nextQuestionText(waId: string, storeId: string, intro: boolean) {
  const admin = createAdminClient()
  await admin.from('rafa_pending_products').update({ current: false }).eq('wa_id', normalizePhone(waId)).eq('current', true)
  const rows = await remaining(storeId)
  if (!rows.length) {
    const skipped = await skippedCount(storeId)
    return {
      text: skipped
        ? `Pronto por agora! ${skipped} produto(s) ficaram pra depois. Quando quiser, é só mandar "continuar preços".`
        : 'Pronto! Todos os produtos novos da nota estão com preço e no estoque.',
      asking: false,
    }
  }
  const row = rows[0]
  await admin.from('rafa_pending_products').update({
    current: true,
    wa_id: normalizePhone(waId),
    asked_at: new Date().toISOString(),
    proposed_price_cents: null,
  }).eq('id', row.id)
  return { text: priceQuestion(row, rows.length, intro ? { total: rows.length } : undefined), asking: true }
}

// Começa (ou retoma) as perguntas de preço. Não faz nada se já tem uma pergunta em aberto.
export async function startPriceQuestions(waId: string, storeId: string) {
  if (await activePriceQuestion(waId)) return false
  const rows = await remaining(storeId)
  if (!rows.length) return false
  const next = await nextQuestionText(waId, storeId, true)
  const sent = await sendText(waId, `${next.text}\n— Rafa`, { noMenu: next.asking })
  if (!sent.ok) throw new Error(sent.error)
  return true
}

async function register(row: Row, priceCents: number, waId: string) {
  const { state } = await loadRafaStore(row.store_id)
  const existing = state.products.find((product) => product.barcode === row.barcode && !product.deletedAt)
  const deleted = state.products.find((product) => product.barcode === row.barcode && product.deletedAt)
  const changes: RafaChange[] = existing
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
  const { state: after, audit } = applyRafaChanges(state, changes, { waId })
  await persistRafaState({ storeId: row.store_id, waId, before: state, after, audit })
  await createAdminClient().from('rafa_pending_products').update({
    status: 'cadastrado',
    current: false,
    price_cents: priceCents,
    updated_at: new Date().toISOString(),
  }).eq('id', row.id)
  if (row.supplier_cnpj && row.supplier_code) {
    await rememberSupplierProduct({ supplierCnpj: row.supplier_cnpj, supplierCode: row.supplier_code, description: row.name, barcode: row.barcode }).catch(() => {})
  }
}

// Resposta do lojista à pergunta de preço. true = tratada aqui (não vai para a IA).
export async function handlePriceAnswer(waId: string, text: string, inReplyTo?: string): Promise<boolean> {
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

  // Preço abaixo do custo: confirma mandando o mesmo valor de novo.
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
