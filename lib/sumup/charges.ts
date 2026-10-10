/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only'

import { randomUUID } from 'node:crypto'

import { loadRafaStore } from '@/lib/inventory/rafa-store'
import { buildRafaChanges } from '@/lib/rafa-agent'
import { recordRafaEvent } from '@/lib/rafa-events'
import { commitRafaChanges } from '@/lib/rafa-ops'
import { createAdminClient } from '@/lib/supabase/admin'
import { affiliate, errorMessage, SITE, sign, storeFetch, SumUpError } from '@/lib/sumup/client'
import { sendText } from '@/lib/whatsapp'

// Cobrança na maquininha Solo: a Rafa (ou o link de vender) manda o valor, a Solo cobra,
// a SumUp avisa pelo webhook e a venda entra no estoque só depois de aprovada.

export type CardType = 'credito' | 'debito'
export type ChargeItem = { productId: string; quantityMilli: number }

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ---------- Maquininhas ----------

export type Reader = { id: string; name: string; status: string }

export async function listReaders(storeId: string): Promise<Reader[]> {
  const { data } = await createAdminClient().from('rpg_sumup_readers').select('id,name,status')
    .eq('store_id', storeId).is('deleted_at', null).order('created_at', { ascending: true })
  return (data || []) as Reader[]
}

// Pareia a Solo com o código que aparece na tela dela (Conexões > API > Conectar).
export async function pairReader(storeId: string, pairingCode: string, name?: string) {
  const code = String(pairingCode || '').replace(/[\s-]/g, '').toUpperCase()
  if (!/^[A-Z0-9]{8,9}$/.test(code)) return { ok: false as const, error: 'O código tem 8 ou 9 letras/números. Confere na tela da maquininha.' }
  const existing = await listReaders(storeId)
  const readerName = String(name || '').trim().slice(0, 60) || `Maquininha ${existing.length + 1}`
  const result = await storeFetch(storeId, (merchant) => `/v0.1/merchants/${merchant}/readers`, { method: 'POST', body: { pairing_code: code, name: readerName } })
  if (!result.ok) {
    const expired = result.status === 404 || result.status === 422
    return { ok: false as const, error: expired ? 'Esse código não funcionou (ele vale 5 minutos). Gera outro na maquininha e me manda.' : errorMessage(result) }
  }
  const reader = result.json || {}
  const row = {
    id: String(reader.id),
    store_id: storeId,
    name: String(reader.name || readerName),
    status: String(reader.status || 'processing'),
    model: reader.device?.model ? String(reader.device.model) : null,
    serial: reader.device?.identifier ? String(reader.device.identifier) : null,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }
  const { error } = await createAdminClient().from('rpg_sumup_readers').upsert(row, { onConflict: 'id' })
  if (error) throw error
  return { ok: true as const, reader: row }
}

// ---------- Cobrança ----------

function webhookUrl(chargeId: string) {
  return `${SITE}/api/sumup/solo-webhook?c=${chargeId}&s=${sign(`solo:${chargeId}`)}`
}

export type CreateChargeInput = {
  storeId: string
  amountCents?: number
  cardType: CardType
  installments?: number
  description?: string
  items?: ChargeItem[]
  source: 'rafa' | 'site'
  waId: string
  replyTo?: string | null
  readerId?: string
}

export type CreateChargeResult =
  | { ok: true; chargeId: string; amountCents: number; readerName: string }
  | { ok: false; code: 'not_connected' | 'no_reader' | 'invalid' | 'busy' | 'offline' | 'error'; error: string }

export async function createCardCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
  const admin = createAdminClient()
  const readers = await listReaders(input.storeId)
  const { data: merchant } = await admin.from('rpg_tap_merchants').select('status').eq('store_id', input.storeId).maybeSingle()
  if (merchant?.status !== 'active') return { ok: false, code: 'not_connected', error: 'A conta SumUp da loja não está conectada.' }
  if (!readers.length) return { ok: false, code: 'no_reader', error: 'Nenhuma maquininha pareada.' }
  const reader = (input.readerId && readers.find((row) => row.id === input.readerId)) || readers[0]

  // Valor: o informado, ou a soma dos itens pelo preço do catálogo.
  let amountCents = Math.round(Number(input.amountCents || 0))
  const items = (input.items || []).filter((item) => item.productId && item.quantityMilli > 0)
  if (items.length) {
    const { state } = await loadRafaStore(input.storeId)
    const byId = new Map(state.products.filter((product) => !product.deletedAt).map((product) => [product.id, product]))
    for (const item of items) if (!byId.has(item.productId)) return { ok: false, code: 'invalid', error: 'Produto da venda não encontrado na loja.' }
    if (!(amountCents > 0)) amountCents = items.reduce((sum, item) => sum + Math.round(byId.get(item.productId)!.priceCents * item.quantityMilli / 1000), 0)
  }
  if (!(amountCents >= 100) || amountCents > 10_000_000) return { ok: false, code: 'invalid', error: 'Valor inválido (mínimo R$ 1,00).' }
  const installments = input.cardType === 'credito' ? Math.min(12, Math.max(1, Math.round(Number(input.installments || 1)))) : 1

  const chargeId = randomUUID()
  const { error: insertError } = await admin.from('rpg_tap_charges').insert({
    id: chargeId,
    store_id: input.storeId,
    amount_cents: amountCents,
    description: input.description?.slice(0, 120) || null,
    source: input.source,
    requested_by_wa_id: input.waId,
    status: 'pending',
    card_mode: input.cardType,
    instalments: installments,
    reader_id: reader.id,
    wa_reply_to: input.replyTo || null,
    sale_payload: items.length ? { items } : null,
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  })
  if (insertError) throw insertError

  const aff = affiliate()
  const body: Record<string, unknown> = {
    total_amount: { currency: 'BRL', minor_unit: 2, value: amountCents },
    card_type: input.cardType === 'credito' ? 'credit' : 'debit',
    ...(installments > 1 ? { installments } : {}),
    description: (input.description || 'Venda RPG').slice(0, 120),
    return_url: webhookUrl(chargeId),
    ...(aff ? { affiliate: { ...aff, foreign_transaction_id: chargeId } } : {}),
  }

  let result
  try {
    result = await storeFetch(input.storeId, (merchant) => `/v0.1/merchants/${merchant}/readers/${reader.id}/checkout`, { method: 'POST', body })
  } catch (error) {
    await admin.from('rpg_tap_charges').update({ status: 'failed', error_message: error instanceof Error ? error.message : 'erro', updated_at: new Date().toISOString() }).eq('id', chargeId)
    if (error instanceof SumUpError && error.code === 'not_connected') return { ok: false, code: 'not_connected', error: 'A conexão com a SumUp caiu. Conecte de novo.' }
    throw error
  }

  if (!result.ok) {
    const message = errorMessage(result)
    await admin.from('rpg_tap_charges').update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() }).eq('id', chargeId)
    if (result.status === 422 && /offline|not.*online|unavailable/i.test(result.text)) return { ok: false, code: 'offline', error: 'A maquininha está desligada ou sem internet.' }
    if (result.status === 409 || /in progress|busy|already/i.test(result.text)) return { ok: false, code: 'busy', error: 'A maquininha já está com uma cobrança aberta. Termine ou cancele ela antes.' }
    return { ok: false, code: 'error', error: message }
  }

  const data = (result.json?.data || result.json || {}) as Record<string, any>
  await admin.from('rpg_tap_charges').update({
    status: 'processing',
    checkout_id: data.checkout_id ? String(data.checkout_id) : null,
    client_transaction_id: data.client_transaction_id ? String(data.client_transaction_id) : null,
    updated_at: new Date().toISOString(),
  }).eq('id', chargeId)
  return { ok: true, chargeId, amountCents, readerName: reader.name }
}

export async function cancelCardCharge(storeId: string) {
  const admin = createAdminClient()
  const { data: open } = await admin.from('rpg_tap_charges').select('id,reader_id')
    .eq('store_id', storeId).in('status', ['pending', 'processing']).not('reader_id', 'is', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!open) return { ok: false as const, error: 'Não tem cobrança aberta na maquininha.' }
  const result = await storeFetch(storeId, (merchant) => `/v0.1/merchants/${merchant}/readers/${open.reader_id}/terminate`, { method: 'POST', body: {} })
  if (!result.ok && result.status !== 404) return { ok: false as const, error: errorMessage(result) }
  await admin.from('rpg_tap_charges').update({ status: 'canceled', updated_at: new Date().toISOString() }).eq('id', open.id).in('status', ['pending', 'processing'])
  return { ok: true as const }
}

export async function chargeStatus(chargeId: string, storeId: string) {
  const { data } = await createAdminClient().from('rpg_tap_charges')
    .select('id,status,amount_cents,card_mode,instalments,card_scheme,card_last4,failure_reason,inventory_finalized_at,inventory_error,created_at')
    .eq('id', chargeId).eq('store_id', storeId).maybeSingle()
  return data
}

// ---------- Resultado (webhook da SumUp) ----------

function cardLabel(row: { card_mode: string | null; instalments: number | null }) {
  if (row.card_mode === 'debito') return 'no débito'
  return Number(row.instalments || 1) > 1 ? `no crédito em ${row.instalments}x` : 'no crédito à vista'
}

// Confere a transação direto na SumUp (não confia só no corpo do webhook) e fecha a cobrança.
export async function settleCharge(chargeId: string) {
  const admin = createAdminClient()
  const { data: charge } = await admin.from('rpg_tap_charges').select('*').eq('id', chargeId).maybeSingle()
  if (!charge || !charge.client_transaction_id) return { status: 'unknown' as const }
  if (['approved', 'failed', 'declined', 'canceled'].includes(String(charge.status)) && charge.completed_at) return { status: 'already' as const }

  const lookup = await storeFetch(String(charge.store_id), (merchant) => `/v2.1/merchants/${merchant}/transactions?client_transaction_id=${encodeURIComponent(String(charge.client_transaction_id))}`)
  if (!lookup.ok) return { status: 'unknown' as const, error: errorMessage(lookup) }
  const tx = (lookup.json || {}) as Record<string, any>
  const txStatus = String(tx.status || '').toUpperCase()
  if (txStatus === 'PENDING' || !txStatus) return { status: 'pending' as const }

  const approved = txStatus === 'SUCCESSFUL'
  const now = new Date().toISOString()
  const { data: claimed } = await admin.from('rpg_tap_charges').update({
    status: approved ? 'approved' : txStatus === 'CANCELLED' ? 'canceled' : 'declined',
    sumup_tx_code: tx.transaction_code ? String(tx.transaction_code) : null,
    sumup_server_tx_id: tx.id ? String(tx.id) : null,
    card_scheme: tx.card?.type ? String(tx.card.type) : null,
    card_last4: tx.card?.last_4_digits ? String(tx.card.last_4_digits) : null,
    instalments: tx.installments_count ? Number(tx.installments_count) : charge.instalments,
    card_raw: { status: tx.status, entry_mode: tx.entry_mode, payment_type: tx.payment_type, card: tx.card || null },
    completed_at: now,
    updated_at: now,
  }).eq('id', chargeId).is('completed_at', null).select('*').maybeSingle()
  if (!claimed) return { status: 'already' as const }

  const waId = String(claimed.requested_by_wa_id || '')
  const card = claimed.card_last4 ? ` (${claimed.card_scheme || 'cartão'} final ${claimed.card_last4})` : ''
  const value = money(Number(claimed.amount_cents))

  if (!approved) {
    const reason = String(claimed.failure_reason || '').trim()
    if (waId) {
      await sendText(waId, `Não passou: ${value} ${cardLabel(claimed)}${reason ? ` (${reason})` : ''}. Quer tentar de novo?`, { inReplyTo: claimed.wa_reply_to || undefined, noMenu: true }).catch(() => null)
      await recordRafaEvent({ waId, storeId: String(claimed.store_id), direction: 'system', kind: 'action', text: `cobrança na maquininha recusada: ${value}` }).catch(() => null)
    }
    return { status: 'declined' as const }
  }

  // Aprovada: registra a venda (se veio com itens) e avisa no WhatsApp.
  const items = Array.isArray((claimed.sale_payload as any)?.items) ? (claimed.sale_payload as any).items as ChargeItem[] : []
  let saleText = ''
  if (items.length) {
    const committed = await commitRafaChanges({
      storeId: String(claimed.store_id),
      waId: waId || 'sumup',
      operationId: `sumup:${chargeId}`,
      tool: 'cobrar_cartao',
      summary: `Venda no cartão ${value}`,
      args: { chargeId },
      build: (fresh) => {
        const built = buildRafaChanges(fresh, items.map((item) => ({ tipo: 'venda', produto_id: item.productId, quantidade: item.quantityMilli / 1000, pagamento: 'card' })), [])
        return 'error' in built ? { error: built.error } : built.changes
      },
    }).catch((error) => ({ status: 'rejected' as const, message: error instanceof Error ? error.message : 'erro' }))
    if (committed.status === 'applied' || committed.status === 'duplicate') {
      await admin.from('rpg_tap_charges').update({ inventory_finalized_at: now }).eq('id', chargeId)
      const { state } = await loadRafaStore(String(claimed.store_id))
      const names = items.map((item) => {
        const product = state.products.find((row) => row.id === item.productId)
        return `${(item.quantityMilli / 1000).toLocaleString('pt-BR')}x ${product?.name || 'produto'}`
      })
      saleText = `\nVenda registrada e estoque baixado: ${names.join(', ')}.`
    } else {
      const message = 'message' in committed ? String(committed.message) : 'falhou'
      await admin.from('rpg_tap_charges').update({ inventory_error: message }).eq('id', chargeId)
      saleText = '\nO pagamento passou, mas não consegui baixar o estoque. Me fala os itens que eu registro.'
    }
  }
  if (waId) {
    await sendText(waId, `Pago ✓ ${value} ${cardLabel(claimed)}${card}.${saleText}`, {
      inReplyTo: claimed.wa_reply_to || undefined,
      // No link de vender o caixa continua aberto: sem menu agora.
      noMenu: claimed.source === 'site',
    }).catch(() => null)
    await recordRafaEvent({ waId, storeId: String(claimed.store_id), direction: 'system', kind: 'action', text: `cobrança na maquininha aprovada: ${value} ${cardLabel(claimed)}${card}${items.length ? ' (venda registrada)' : ''}` }).catch(() => null)
  }
  return { status: 'approved' as const }
}

export async function recordWebhookFailureReason(chargeId: string, reason: string | null) {
  if (!reason) return
  await createAdminClient().from('rpg_tap_charges').update({ failure_reason: reason.slice(0, 300) }).eq('id', chargeId)
}
