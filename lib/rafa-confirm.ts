import { createAdminClient } from '@/lib/supabase/admin'
import { applyRafaChanges, loadRafaStore, persistRafaState, refreshRafaSnapshots, revalidateRafaChanges, type RafaChange, type RafaStoreState } from '@/lib/inventory/rafa-store'
import { sendActionButtons, sendText } from '@/lib/whatsapp'

export const RAFA_CONFIRM_TTL_MS = 15 * 60 * 1000
export const CONFIRM_YES_ID = 'confirm_yes'
export const CONFIRM_NO_ID = 'confirm_no'

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const stock = (milli: number) => `${(milli / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} un.`

export function isTextConfirmationAttempt(text: string) {
  const normalized = text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return ['sim', 'ss', 'isso', 'pode'].includes(normalized)
}

function productLabel(state: RafaStoreState, productId: string) {
  const product = state.products.find((item) => item.id === productId)
  if (!product) return productId
  return `${product.name} (EAN ${product.barcode})`
}

export function confirmationMessage(state: RafaStoreState, changes: RafaChange[]) {
  const lines = changes.map((change) => {
    const label = productLabel(state, change.productId)
    if (change.kind === 'preco') {
      return `• ${label}: preço hoje ${money(change.expectedPriceCents)} → novo preço ${money(change.newPriceCents)}`
    }
    if (change.kind === 'estoque') {
      return `• ${label}: estoque hoje ${stock(change.expectedStockMilli)} → novo estoque ${stock(change.newStockMilli)}`
    }
    if (change.kind === 'entrada') {
      return `• ${label}: estoque hoje ${stock(change.expectedStockMilli)} → entrada de ${stock(change.quantityMilli)}, custo unitário ${money(change.unitCostCents)}`
    }
    return `• ${label}: estoque hoje ${stock(change.expectedStockMilli)} → venda de ${stock(change.quantityMilli)}`
  })
  return `${lines.join('\n')}\n\nQuer que eu faça essas alterações?\n— Rafa`
}

export async function createRafaPendingAction(input: {
  waId: string
  storeId: string
  tipo: 'preco' | 'estoque' | 'venda' | 'entrada' | 'outro'
  payload: Record<string, unknown>
  message: string
}) {
  const admin = createAdminClient()
  await admin.from('rafa_pending_actions').update({ status: 'invalidada' }).eq('wa_id', input.waId).eq('status', 'pendente')
  const { data, error } = await admin.from('rafa_pending_actions').insert({
    wa_id: input.waId,
    store_id: input.storeId,
    tipo: input.tipo,
    payload: input.payload,
    mensagem_confirmacao: input.message,
    status: 'pendente',
    expires_at: new Date(Date.now() + RAFA_CONFIRM_TTL_MS).toISOString(),
  }).select('id').single()
  if (error) throw error
  return String(data.id)
}

export async function askRafaConfirmation(input: {
  waId: string
  storeId: string
  changes: RafaChange[]
  state: RafaStoreState
  inReplyTo?: string
}) {
  const message = confirmationMessage(input.state, input.changes)
  const kinds = [...new Set(input.changes.map((change) => change.kind))]
  const tipo = kinds.length === 1 ? kinds[0] : 'outro'
  await createRafaPendingAction({
    waId: input.waId,
    storeId: input.storeId,
    tipo,
    payload: { kind: 'changes', changes: input.changes },
    message,
  })
  return sendActionButtons(
    input.waId,
    message,
    'Só o botão Sim autoriza a alteração.',
    [{ id: CONFIRM_YES_ID, title: 'Sim' }, { id: CONFIRM_NO_ID, title: 'Não' }],
    input.inReplyTo ? { inReplyTo: input.inReplyTo } : undefined,
  )
}

export async function askRafaMediaConfirmation(input: {
  waId: string
  storeId: string
  importId: string
  message: string
  inReplyTo?: string
}) {
  await createRafaPendingAction({
    waId: input.waId,
    storeId: input.storeId,
    tipo: 'outro',
    payload: { kind: 'invoice_media', import_id: input.importId },
    message: input.message,
  })
  return sendActionButtons(
    input.waId,
    input.message,
    'A extração só começa depois do Sim.',
    [{ id: CONFIRM_YES_ID, title: 'Sim' }, { id: CONFIRM_NO_ID, title: 'Não' }],
    input.inReplyTo ? { inReplyTo: input.inReplyTo } : undefined,
  )
}

export async function getPendingRafaAction(waId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.from('rafa_pending_actions')
    .select('*')
    .eq('wa_id', waId)
    .eq('status', 'pendente')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function refuseRafaPending(waId: string) {
  const admin = createAdminClient()
  const pending = await getPendingRafaAction(waId)
  if (pending) {
    await admin.from('rafa_pending_actions').update({ status: 'recusada' }).eq('id', pending.id)
  }
  await admin.from('whatsapp_sessions').update({ etapa: 'menu', payload: {}, updated_at: new Date().toISOString() }).eq('wa_id', waId)
  return sendText(waId, 'sem problema, me explica de novo\n— Rafa')
}

export type ConfirmRafaResult =
  | { kind: 'none' }
  | { kind: 'expired' }
  | { kind: 'media'; importId: string; storeId: string }
  | { kind: 'invalidated'; message: string }
  | { kind: 'applied'; changes: RafaChange[] }

export async function confirmRafaPending(waId: string): Promise<ConfirmRafaResult> {
  const admin = createAdminClient()
  const pending = await getPendingRafaAction(waId)
  if (!pending) return { kind: 'none' }

  if (new Date(pending.expires_at).getTime() <= Date.now()) {
    await admin.from('rafa_pending_actions').update({ status: 'expirada' }).eq('id', pending.id)
    await sendText(waId, 'Essa confirmação expirou. Me manda o pedido de novo.\n— Rafa')
    return { kind: 'expired' }
  }

  const payload = pending.payload as any
  if (payload?.kind === 'invoice_media') {
    await admin.from('rafa_pending_actions').update({ status: 'confirmada', confirmed_at: new Date().toISOString() }).eq('id', pending.id)
    return { kind: 'media', importId: String(payload.import_id), storeId: String(pending.store_id) }
  }

  const changes = Array.isArray(payload?.changes) ? payload.changes as RafaChange[] : []
  if (!changes.length) {
    await admin.from('rafa_pending_actions').update({ status: 'invalidada' }).eq('id', pending.id)
    return { kind: 'none' }
  }

  const { state } = await loadRafaStore(String(pending.store_id))
  const mismatches = revalidateRafaChanges(state, changes)
  if (mismatches.length) {
    await admin.from('rafa_pending_actions').update({ status: 'invalidada' }).eq('id', pending.id)
    const refreshed = refreshRafaSnapshots(state, changes)
    const message = confirmationMessage(state, refreshed)
    await createRafaPendingAction({
      waId,
      storeId: String(pending.store_id),
      tipo: pending.tipo,
      payload: { kind: 'changes', changes: refreshed },
      message,
    })
    await sendActionButtons(
      waId,
      `O valor mudou enquanto você confirmava. Atualizei a informação:\n\n${message}`,
      'Confira de novo antes de autorizar.',
      [{ id: CONFIRM_YES_ID, title: 'Sim' }, { id: CONFIRM_NO_ID, title: 'Não' }],
    )
    return { kind: 'invalidated', message }
  }

  const { state: after, audit } = applyRafaChanges(state, changes, { waId })
  await persistRafaState({ storeId: String(pending.store_id), waId, before: state, after, audit })
  await admin.from('rafa_pending_actions').update({
    status: 'confirmada',
    confirmed_at: new Date().toISOString(),
  }).eq('id', pending.id)
  return { kind: 'applied', changes }
}
