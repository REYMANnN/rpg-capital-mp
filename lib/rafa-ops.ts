/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only'

import { randomUUID } from 'node:crypto'

import {
  applyRafaChanges,
  loadRafaStore,
  persistRafaState,
  RafaStateConflictError,
  type RafaChange,
  type RafaInventoryProduct,
  type RafaStoreState,
} from '@/lib/inventory/rafa-store'
import { rafaOperationRisks, validateRafaChangesStrict } from '@/lib/rafa-ops-core'
import { createAdminClient } from '@/lib/supabase/admin'

export { rafaOperationRisks, validateRafaChangesStrict } from '@/lib/rafa-ops-core'

// Toda escrita da Rafa passa por aqui:
// 1) operation_id único: a mesma ação nunca roda duas vezes (retry do webhook, clique duplo, IA repetindo);
// 2) validação fixa no servidor depois da IA (limites, produto da loja, EAN válido);
// 3) gravação com versão do estado: se alguém mexeu na loja no meio, recarrega e refaz (até 3 vezes);
// 4) antes/depois de cada produto tocado fica gravado para o "desfaz" restaurar tudo de uma vez.

export type CommitResult =
  | { status: 'applied'; operationId: string; id: string; changes: RafaChange[]; after: RafaStoreState; before: RafaStoreState }
  | { status: 'duplicate'; operationId: string; id: string; summary: string | null }
  | { status: 'rejected'; message: string }

type SideEffects = {
  pending_product_ids?: string[]
  invoice_import_id?: string
}

function touchedIds(changes: RafaChange[]) {
  return [...new Set(changes.map((change) => change.productId))]
}

function pickProducts(state: RafaStoreState, ids: string[]) {
  const set = new Set(ids)
  return state.products.filter((product) => set.has(product.id)).map((product) => ({ ...product }))
}

export async function commitRafaChanges(input: {
  storeId: string
  waId: string
  operationId: string
  tool: string
  summary: string
  args?: Record<string, unknown>
  // Recebe o estado mais novo e devolve as alterações (ou o motivo de não fazer).
  build: (state: RafaStoreState) => RafaChange[] | { error: string }
  invoiceImportId?: string
  sideEffects?: SideEffects
}): Promise<CommitResult> {
  const admin = createAdminClient()
  const operationId = input.operationId.slice(0, 300)

  // Reserva o operation_id antes de qualquer escrita. Se já existe, é repetição: não executa de novo.
  const { data: reserved, error: reserveError } = await admin.from('rafa_operations').insert({
    operation_id: operationId,
    store_id: input.storeId,
    wa_id: input.waId,
    tool: input.tool,
    summary: input.summary.slice(0, 500),
    input: input.args || {},
    side_effects: input.sideEffects || {},
    status: 'pending',
  }).select('id').maybeSingle()
  if (reserveError) {
    if ((reserveError as { code?: string }).code === '23505') {
      const { data: existing } = await admin.from('rafa_operations').select('id,summary,status').eq('operation_id', operationId).maybeSingle()
      if (existing && existing.status !== 'failed') {
        return { status: 'duplicate', operationId, id: String(existing.id), summary: existing.summary ? String(existing.summary) : null }
      }
      // Uma tentativa anterior falhou: libera o id para tentar de novo.
      await admin.from('rafa_operations').delete().eq('operation_id', operationId).eq('status', 'failed')
      return commitRafaChanges(input)
    }
    throw reserveError
  }
  const opId = String(reserved!.id)

  const fail = async (message: string) => {
    await admin.from('rafa_operations').update({ status: 'failed', error: message.slice(0, 500) }).eq('id', opId)
    return { status: 'rejected' as const, message }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { state } = await loadRafaStore(input.storeId)
    const built = input.build(state)
    if (!Array.isArray(built)) return fail(built.error)
    if (!built.length) return fail('Nada para alterar.')
    const invalid = validateRafaChangesStrict(state, built)
    if (invalid) return fail(invalid)

    let after: RafaStoreState
    let audit: Array<Record<string, unknown>>
    try {
      ({ state: after, audit } = applyRafaChanges(state, built, { waId: input.waId, invoiceImportId: input.invoiceImportId }))
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Não consegui aplicar a alteração.')
    }

    try {
      const { versionAfter } = await persistRafaState({ storeId: input.storeId, waId: input.waId, before: state, after, audit })
      const ids = touchedIds(built)
      const beforeMovementIds = new Set(state.movements.map((movement) => movement.id))
      const beforeSaleIds = new Set(state.sales.map((sale) => sale.id))
      await admin.from('rafa_operations').update({
        status: 'applied',
        changes: built,
        before_products: pickProducts(state, ids),
        after_products: pickProducts(after, ids),
        created_movement_ids: after.movements.filter((movement) => !beforeMovementIds.has(movement.id)).map((movement) => movement.id),
        created_sale_ids: after.sales.filter((sale) => !beforeSaleIds.has(sale.id)).map((sale) => sale.id),
        state_version_after: versionAfter,
        applied_at: new Date().toISOString(),
      }).eq('id', opId)
      return { status: 'applied', operationId, id: opId, changes: built, after, before: state }
    } catch (error) {
      if (error instanceof RafaStateConflictError) continue // alguém mexeu na loja: recarrega e refaz
      await fail(error instanceof Error ? error.message : 'falha ao gravar')
      throw error
    }
  }
  return fail('A loja mudou várias vezes seguidas enquanto eu gravava. Tenta de novo em instantes.')
}

// ---------- Desfazer ----------

export type UndoResult =
  | { status: 'undone'; summary: string }
  | { status: 'nothing' }
  | { status: 'blocked'; message: string }

const COMPARED_FIELDS: Array<keyof RafaInventoryProduct> = ['priceCents', 'stockMilli', 'averageCostCents', 'name', 'barcode', 'deletedAt']

function sameProduct(a: RafaInventoryProduct | undefined, b: RafaInventoryProduct | undefined) {
  if (!a || !b) return !a && !b
  return COMPARED_FIELDS.every((field) => (a as any)[field] === (b as any)[field] || ((a as any)[field] == null && (b as any)[field] == null))
}

export async function undoLastRafaOperation(input: { storeId: string; waId: string }): Promise<UndoResult> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - 48 * 3600_000).toISOString()
  const { data: op } = await admin.from('rafa_operations')
    .select('*')
    .eq('store_id', input.storeId)
    .eq('status', 'applied')
    .is('undo_of', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!op) return { status: 'nothing' }
  return undoRafaOperationRow(op, input)
}

// Desfaz uma nota inteira: todas as operações ligadas a ela (entradas e cadastros dos produtos
// novos), da mais nova para a mais antiga. Para no primeiro bloqueio e diz o que já voltou.
export async function undoRafaInvoice(input: { storeId: string; waId: string; invoiceImportId: string }): Promise<UndoResult> {
  const admin = createAdminClient()
  const { data: pending } = await admin.from('rafa_pending_products').select('id').eq('invoice_import_id', input.invoiceImportId)
  const pendingIds = new Set((pending || []).map((row) => String(row.id)))
  const { data: ops } = await admin.from('rafa_operations')
    .select('*')
    .eq('store_id', input.storeId)
    .eq('status', 'applied')
    .is('undo_of', null)
    .order('created_at', { ascending: false })
    .limit(200)
  const linked = (ops || []).filter((op) => {
    const effects = (op.side_effects || {}) as SideEffects
    if (effects.invoice_import_id === input.invoiceImportId) return true
    return (effects.pending_product_ids || []).some((id) => pendingIds.has(id))
  })
  if (!linked.length) return { status: 'nothing' }
  const done: string[] = []
  for (const op of linked) {
    const result = await undoRafaOperationRow(op, input)
    if (result.status === 'blocked') {
      return { status: 'blocked', message: done.length ? `Desfiz ${done.length} parte(s) da nota, mas parei: ${result.message}` : result.message }
    }
    if (result.status === 'undone') done.push(result.summary)
  }
  await admin.from('rafa_invoice_imports').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', input.invoiceImportId)
  await admin.from('rafa_pending_products').update({ status: 'descartado', current: false, updated_at: new Date().toISOString() })
    .eq('invoice_import_id', input.invoiceImportId).in('status', ['aguardando_preco', 'pulado', 'cadastrado'])
  return { status: 'undone', summary: `nota inteira (${done.length} alteração(ões))` }
}

async function undoRafaOperationRow(op: any, input: { storeId: string; waId: string }): Promise<UndoResult> {
  const admin = createAdminClient()

  const beforeProducts = (op.before_products || []) as RafaInventoryProduct[]
  const afterProducts = (op.after_products || []) as RafaInventoryProduct[]
  const createdMovements = new Set((op.created_movement_ids || []) as string[])
  const createdSales = new Set((op.created_sale_ids || []) as string[])
  const undoOperationId = `undo:${op.id}`

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { state } = await loadRafaStore(input.storeId)
    // Só desfaz se ninguém mexeu nesses produtos depois: senão avisa, nunca sobrescreve.
    for (const expected of afterProducts) {
      const current = state.products.find((product) => product.id === expected.id)
      if (!sameProduct(current, expected)) {
        return { status: 'blocked', message: `${expected.name} mudou depois dessa alteração, então não desfaço automaticamente para não apagar a mudança nova.` }
      }
    }
    const beforeById = new Map(beforeProducts.map((product) => [product.id, product]))
    const afterIds = new Set(afterProducts.map((product) => product.id))
    const restored: RafaStoreState = {
      ...state,
      products: state.products
        .filter((product) => !afterIds.has(product.id) || beforeById.has(product.id))
        .map((product) => beforeById.has(product.id) ? { ...beforeById.get(product.id)! } : product),
      movements: state.movements.filter((movement) => !createdMovements.has(movement.id)),
      sales: state.sales.filter((sale) => !createdSales.has(sale.id)),
    }

    const { data: reserved, error: reserveError } = await admin.from('rafa_operations').insert({
      operation_id: undoOperationId,
      store_id: input.storeId,
      wa_id: input.waId,
      tool: 'desfazer',
      summary: `Desfez: ${String(op.summary || op.tool)}`.slice(0, 500),
      undo_of: op.id,
      status: 'pending',
    }).select('id').maybeSingle()
    if (reserveError) {
      if ((reserveError as { code?: string }).code === '23505') return { status: 'nothing' }
      throw reserveError
    }
    try {
      const { versionAfter } = await persistRafaState({
        storeId: input.storeId,
        waId: input.waId,
        before: state,
        after: restored,
        audit: [{ tipo: 'desfazer', operacao: op.id, resumo: op.summary }],
      })
      await admin.from('rafa_operations').update({ status: 'applied', applied_at: new Date().toISOString(), state_version_after: versionAfter }).eq('id', reserved!.id)
      await admin.from('rafa_operations').update({ status: 'undone', undone_at: new Date().toISOString() }).eq('id', op.id)
      // Efeitos fora do estoque voltam também (produtos pendentes de preço, nota aplicada).
      const effects = (op.side_effects || {}) as SideEffects
      if (effects.pending_product_ids?.length) {
        await admin.from('rafa_pending_products').update({ status: 'aguardando_preco', price_cents: null, updated_at: new Date().toISOString() }).in('id', effects.pending_product_ids)
      }
      if (effects.invoice_import_id) {
        await admin.from('rafa_invoice_imports').update({ status: 'ready', applied_at: null, updated_at: new Date().toISOString() }).eq('id', effects.invoice_import_id).eq('status', 'applied')
      }
      return { status: 'undone', summary: String(op.summary || op.tool) }
    } catch (error) {
      await admin.from('rafa_operations').delete().eq('id', reserved!.id)
      if (error instanceof RafaStateConflictError) continue
      throw error
    }
  }
  return { status: 'blocked', message: 'A loja mudou enquanto eu desfazia. Tenta de novo em instantes.' }
}

// ---------- Trava por número / loja ----------

export async function withRafaLock<T>(key: string, fn: () => Promise<T>, options?: { waitMs?: number; ttlSeconds?: number }): Promise<T> {
  const admin = createAdminClient()
  const holder = randomUUID()
  const deadline = Date.now() + (options?.waitMs ?? 60_000)
  let locked = false
  while (Date.now() < deadline) {
    const { data, error } = await admin.rpc('rafa_try_lock', { p_key: key, p_holder: holder, p_ttl_seconds: options?.ttlSeconds ?? 180 })
    if (error) break // sem a função de trava (migration não aplicada): segue sem trava
    if (data === true) { locked = true; break }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  try {
    return await fn()
  } finally {
    if (locked) await admin.rpc('rafa_release_lock', { p_key: key, p_holder: holder })
  }
}

export async function lastRafaOperations(storeId: string, limit = 5) {
  const { data } = await createAdminClient().from('rafa_operations')
    .select('id,tool,summary,status,created_at')
    .eq('store_id', storeId)
    .in('status', ['applied', 'undone'])
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}
