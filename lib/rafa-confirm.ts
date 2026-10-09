import { createAdminClient } from '@/lib/supabase/admin'
import { confirmationTextId } from '@/lib/rafa-conversation'
import { loadRafaStore, refreshRafaSnapshots, revalidateRafaChanges, type RafaChange, type RafaStoreState } from '@/lib/inventory/rafa-store'
import { commitRafaChanges } from '@/lib/rafa-ops'
import { sendActionButtons, sendText } from '@/lib/whatsapp'

export const RAFA_CONFIRM_TTL_MS = 15 * 60 * 1000
export const CONFIRM_YES_ID = 'confirm_yes'
export const CONFIRM_NO_ID = 'confirm_no'

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const stock = (milli: number) => `${(milli / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} un.`

export function isTextConfirmationAttempt(text: string) {
  return confirmationTextId(text) !== null
}

export { confirmationTextId } from '@/lib/rafa-conversation'

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
    if (change.kind === 'cadastrar') {
      const verb = change.reactivate ? 'reativar' : 'cadastrar'
      return `• ${verb} ${change.name} (EAN ${change.barcode}): preço ${money(change.priceCents)}, custo ${money(change.costCents)}, estoque inicial ${stock(change.stockMilli)}`
    }
    if (change.kind === 'remover') {
      return `• remover ${label} do estoque (hoje tem ${stock(change.expectedStockMilli)})`
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
  // Resumo próprio (ex.: importação de planilha com muitos itens) no lugar da lista item a item.
  message?: string
  invoiceImportId?: string
}) {
  const message = input.message || confirmationMessage(input.state, input.changes)
  const kinds = [...new Set(input.changes.map((change) => change.kind))]
  const tipo = kinds.length === 1 && ['preco', 'estoque', 'venda', 'entrada'].includes(kinds[0])
    ? kinds[0] as 'preco' | 'estoque' | 'venda' | 'entrada'
    : 'outro'
  await createRafaPendingAction({
    waId: input.waId,
    storeId: input.storeId,
    tipo,
    payload: { kind: 'changes', changes: input.changes, ...(input.invoiceImportId ? { invoice_import_id: input.invoiceImportId } : {}) },
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
  return sendText(
    input.waId,
    input.message,
    { ...(input.inReplyTo ? { inReplyTo: input.inReplyTo } : {}), noMenu: true },
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
  const payload = pending?.payload as any

  // Na coleta de uma nota, "não" / "2" significa "a nota ainda não está completa".
  // A sessão continua aberta para receber quantas fotos forem necessárias.
  if (pending && payload?.kind === 'invoice_media') {
    return sendText(
      waId,
      'Certo. Pode mandar a próxima foto. Quando terminar, responda 1 ou diga que acabou.\n— Rafa',
      { noMenu: true },
    )
  }

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
  | { kind: 'applied'; changes: RafaChange[]; after: RafaStoreState; storeId: string }

export async function confirmRafaPending(waId: string): Promise<ConfirmRafaResult> {
  const admin = createAdminClient()
  const pending = await getPendingRafaAction(waId)
  if (!pending) return { kind: 'none' }

  if (new Date(pending.expires_at).getTime() <= Date.now()) {
    await admin.from('rafa_pending_actions').update({ status: 'expirada' }).eq('id', pending.id)
    await sendText(waId, 'Essa confirmação expirou. Me manda o pedido de novo.\n— Rafa')
    return { kind: 'expired' }
  }

  // Só quem "ganhar" a troca pendente → confirmada executa (clique duplo, sim + botão, retry do webhook).
  const claim = async () => {
    const { data } = await admin.from('rafa_pending_actions')
      .update({ status: 'confirmada', confirmed_at: new Date().toISOString() })
      .eq('id', pending.id).eq('status', 'pendente')
      .select('id').maybeSingle()
    return Boolean(data)
  }

  const payload = pending.payload as any
  if (payload?.kind === 'invoice_media') {
    const importId = String(payload.import_id)
    const { data: invoice, error } = await admin.from('rafa_invoice_imports')
      .select('classification')
      .eq('id', importId)
      .eq('wa_id', waId)
      .eq('store_id', String(pending.store_id))
      .maybeSingle()
    if (error) throw error
    if (!invoice) return { kind: 'none' }
    const classification = invoice.classification && typeof invoice.classification === 'object' && !Array.isArray(invoice.classification)
      ? invoice.classification as Record<string, unknown>
      : {}
    const { error: completeError } = await admin.from('rafa_invoice_imports').update({
      classification: { ...classification, collection_mode: 'photos', collection_complete: true },
      updated_at: new Date().toISOString(),
    }).eq('id', importId).eq('status', 'classified')
    if (completeError) throw completeError
    if (!await claim()) return { kind: 'none' }
    return { kind: 'media', importId, storeId: String(pending.store_id) }
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

  if (!await claim()) return { kind: 'none' }
  const committed = await commitRafaChanges({
    storeId: String(pending.store_id),
    waId,
    operationId: `pending:${pending.id}`,
    tool: 'confirmacao',
    summary: String(pending.mensagem_confirmacao || 'alteração confirmada').split('\n').slice(0, 3).join(' ').slice(0, 300),
    args: { pending_action_id: pending.id },
    sideEffects: payload?.invoice_import_id ? { invoice_import_id: String(payload.invoice_import_id) } : undefined,
    invoiceImportId: payload?.invoice_import_id ? String(payload.invoice_import_id) : undefined,
    // Estado mais novo: se algo mudou desde a pergunta, não grava por cima.
    build: (fresh) => revalidateRafaChanges(fresh, changes).length ? { error: 'O estoque mudou enquanto você confirmava. Me pede de novo que eu refaço com os valores de agora.' } : changes,
  })
  if (committed.status === 'rejected') {
    await sendText(waId, `${committed.message}\n— Rafa`)
    return { kind: 'invalidated', message: committed.message }
  }
  if (committed.status === 'duplicate') return { kind: 'none' }
  if (payload?.invoice_import_id) {
    await admin.from('rafa_invoice_imports').update({ status: 'applied', applied_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', String(payload.invoice_import_id))
  }
  return { kind: 'applied', changes, after: committed.after, storeId: String(pending.store_id) }
}

// Mensagem de resultado depois do Sim: diz exatamente o que ficou valendo.
export function appliedMessage(after: RafaStoreState, changes: RafaChange[]) {
  const byId = new Map(after.products.map((product) => [product.id, product]))
  const lines = changes.map((change) => {
    const product = byId.get(change.productId)
    const name = product ? `${product.name} (EAN ${product.barcode})` : 'produto'
    if (change.kind === 'preco') return `• o preço de ${name} agora é ${money(change.newPriceCents)}`
    if (change.kind === 'estoque') return `• o estoque de ${name} agora é ${stock(product?.stockMilli ?? change.newStockMilli)}`
    if (change.kind === 'entrada') return `• entrada de ${stock(change.quantityMilli)} em ${name}; estoque agora ${stock(product?.stockMilli ?? 0)}`
    if (change.kind === 'venda') return `• venda de ${stock(change.quantityMilli)} de ${name}; estoque agora ${stock(product?.stockMilli ?? 0)}`
    if (change.kind === 'cadastrar') return `• ${change.name} (EAN ${change.barcode}) ${change.reactivate ? 'reativado' : 'cadastrado'}: ${money(change.priceCents)}, estoque ${stock(change.stockMilli)}`
    return `• ${name} foi removido do estoque`
  })
  return `Pronto!\n${lines.join('\n')}\n— Rafa`
}
