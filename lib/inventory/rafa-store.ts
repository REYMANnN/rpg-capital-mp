import { randomUUID } from 'node:crypto'

import { writeAuditEvent } from '@/lib/accounts/audit'
import { completeSale, type PaymentMethod, type Product, type Sale, type ScaleRule } from '@/lib/inventory/core'
import { calculatePurchaseUpdate } from '@/lib/inventory/intake'
import { validateSalePrice } from '@/lib/inventory/productRules'
import { INVENTORY_APP_VERSION } from '@/lib/inventory/version'
import { deriveInventoryStateEvents } from '@/lib/platform/events/inventoryStateEvents'
import { emitPlatformEvent } from '@/lib/platform/events/outbox'
import { createAdminClient } from '@/lib/supabase/admin'

export type RafaInventoryProduct = Product & {
  unit?: 'UN' | 'KG'
  catalogSource?: string
  catalogBrand?: string
  catalogImageUrl?: string
  deletedAt?: string
}

export type RafaMovement = {
  id: string
  productId: string
  type: 'initial' | 'purchase' | 'sale' | 'adjustment'
  quantityMilli: number
  createdAt: string
  note: string
  supplierDocument?: string
  supplierName?: string
  invoiceKey?: string
  invoiceNumber?: string
  origem?: 'whatsapp' | 'scanner' | 'invoice_photo'
  rafaInvoiceImportId?: string
}

export type RafaSale = Sale & { origem?: 'whatsapp' | 'scanner' }

export type RafaStoreState = {
  products: RafaInventoryProduct[]
  sales: RafaSale[]
  movements: RafaMovement[]
  scaleRule?: ScaleRule
}

export type RafaChange =
  | {
      kind: 'preco'
      productId: string
      expectedPriceCents: number
      newPriceCents: number
      reason?: string
    }
  | {
      kind: 'estoque'
      productId: string
      expectedStockMilli: number
      newStockMilli: number
      reason?: string
    }
  | {
      kind: 'entrada'
      productId: string
      expectedStockMilli: number
      quantityMilli: number
      unitCostCents: number
      reason?: string
    }
  | {
      kind: 'venda'
      productId: string
      expectedStockMilli: number
      quantityMilli: number
      paymentMethod?: PaymentMethod
      reason?: string
    }

type StoreContext = {
  id: string
  businessId: string | null
  installationId: string
  displayName: string
}

function isState(value: unknown): value is RafaStoreState {
  if (!value || typeof value !== 'object') return false
  const state = value as RafaStoreState
  return Array.isArray(state.products) && Array.isArray(state.sales) && Array.isArray(state.movements)
}

export async function loadRafaStore(storeId: string): Promise<{ store: StoreContext; state: RafaStoreState }> {
  const admin = createAdminClient()
  const { data: store, error: storeError } = await admin
    .from('inventory_v1_stores')
    .select('id,business_id,installation_id,display_name,active')
    .eq('id', storeId)
    .eq('active', true)
    .maybeSingle()
  if (storeError) throw storeError
  if (!store?.installation_id) throw new Error('rafa_store_not_found')

  const { data, error } = await admin.rpc('inventory_v1_get_state', { p_installation_id: store.installation_id })
  if (error) throw error
  const result = (data ?? {}) as { found?: boolean; state?: unknown }
  const state = result.found && isState(result.state)
    ? result.state
    : { products: [], sales: [], movements: [] }

  return {
    store: {
      id: String(store.id),
      businessId: store.business_id ? String(store.business_id) : null,
      installationId: String(store.installation_id),
      displayName: String(store.display_name || ''),
    },
    state,
  }
}

export type RafaRevalidationMismatch = {
  productId: string
  field: 'priceCents' | 'stockMilli'
  expected: number
  current: number
}

export function revalidateRafaChanges(state: RafaStoreState, changes: RafaChange[]) {
  const byId = new Map(state.products.map((product) => [product.id, product]))
  const mismatches: RafaRevalidationMismatch[] = []

  for (const change of changes) {
    const product = byId.get(change.productId)
    if (!product) {
      mismatches.push({ productId: change.productId, field: 'stockMilli', expected: -1, current: -2 })
      continue
    }
    if (change.kind === 'preco') {
      if (product.priceCents !== change.expectedPriceCents) {
        mismatches.push({
          productId: change.productId,
          field: 'priceCents',
          expected: change.expectedPriceCents,
          current: product.priceCents,
        })
      }
    } else if (product.stockMilli !== change.expectedStockMilli) {
      mismatches.push({
        productId: change.productId,
        field: 'stockMilli',
        expected: change.expectedStockMilli,
        current: product.stockMilli,
      })
    }
  }
  return mismatches
}

export function refreshRafaSnapshots(state: RafaStoreState, changes: RafaChange[]): RafaChange[] {
  const byId = new Map(state.products.map((product) => [product.id, product]))
  return changes.map((change) => {
    const product = byId.get(change.productId)
    if (!product) return change
    if (change.kind === 'preco') return { ...change, expectedPriceCents: product.priceCents }
    return { ...change, expectedStockMilli: product.stockMilli }
  })
}

export function applyRafaChanges(
  state: RafaStoreState,
  changes: RafaChange[],
  options: { waId: string; invoiceImportId?: string } ,
) {
  let next: RafaStoreState = {
    ...state,
    products: state.products.map((product) => ({ ...product })),
    sales: [...state.sales],
    movements: [...state.movements],
  }
  const now = new Date().toISOString()
  const audit: Array<Record<string, unknown>> = []

  for (const change of changes.filter((item) => item.kind === 'preco')) {
    const product = next.products.find((item) => item.id === change.productId)
    if (!product) throw new Error('Produto não encontrado.')
    const error = validateSalePrice(change.newPriceCents)
    if (error) throw new Error(error)
    const before = product.priceCents
    product.priceCents = change.newPriceCents
    audit.push({
      tipo: 'preco',
      productId: product.id,
      produto: product.name,
      de: before,
      para: change.newPriceCents,
      motivo: change.reason || null,
    })
  }

  for (const change of changes.filter((item) => item.kind === 'estoque')) {
    const product = next.products.find((item) => item.id === change.productId)
    if (!product) throw new Error('Produto não encontrado.')
    if (!Number.isInteger(change.newStockMilli) || change.newStockMilli < 0) throw new Error('Estoque inválido.')
    const before = product.stockMilli
    const delta = change.newStockMilli - before
    product.stockMilli = change.newStockMilli
    if (delta) {
      next.movements.push({
        id: randomUUID(),
        productId: product.id,
        type: 'adjustment',
        quantityMilli: delta,
        createdAt: now,
        note: change.reason ? `Ajuste pela Rafa: ${change.reason}` : 'Ajuste pela Rafa',
        origem: 'whatsapp',
      })
    }
    audit.push({
      tipo: 'estoque',
      productId: product.id,
      produto: product.name,
      de: before,
      para: change.newStockMilli,
      motivo: change.reason || null,
    })
  }

  for (const change of changes.filter((item) => item.kind === 'entrada')) {
    const product = next.products.find((item) => item.id === change.productId)
    if (!product) throw new Error('Produto não encontrado.')
    const before = product.stockMilli
    const update = calculatePurchaseUpdate(
      product.stockMilli,
      Math.max(0, Math.round(product.averageCostCents ?? 0)),
      change.quantityMilli,
      change.unitCostCents,
    )
    product.stockMilli = update.stockMilli
    product.averageCostCents = update.averageCostCents
    next.movements.push({
      id: randomUUID(),
      productId: product.id,
      type: 'purchase',
      quantityMilli: change.quantityMilli,
      createdAt: now,
      note: change.reason ? `Entrada pela Rafa: ${change.reason}` : 'Entrada pela Rafa',
      origem: options.invoiceImportId ? 'invoice_photo' : 'whatsapp',
      ...(options.invoiceImportId ? { rafaInvoiceImportId: options.invoiceImportId } : {}),
    })
    audit.push({
      tipo: 'entrada',
      productId: product.id,
      produto: product.name,
      de: before,
      para: product.stockMilli,
      quantidade: change.quantityMilli,
      custoUnitario: change.unitCostCents,
      motivo: change.reason || null,
    })
  }

  const sales = changes.filter((item): item is Extract<RafaChange, { kind: 'venda' }> => item.kind === 'venda')
  if (sales.length) {
    const paymentMethod = sales.find((item) => item.paymentMethod)?.paymentMethod
    const completed = completeSale(
      next.products,
      sales.map((item) => ({ productId: item.productId, quantityMilli: item.quantityMilli })),
      randomUUID(),
      paymentMethod ? { method: paymentMethod, confirmedAt: now } : undefined,
    )
    const beforeById = new Map(next.products.map((product) => [product.id, product.stockMilli]))
    next.products = completed.products.map((product) => ({ ...product })) as RafaInventoryProduct[]
    next.sales.push({ ...completed.sale, origem: 'whatsapp' })
    for (const item of completed.sale.items) {
      const product = next.products.find((candidate) => candidate.id === item.productId)
      next.movements.push({
        id: randomUUID(),
        productId: item.productId,
        type: 'sale',
        quantityMilli: -item.quantityMilli,
        createdAt: now,
        note: 'Venda pela Rafa',
        origem: 'whatsapp',
      })
      audit.push({
        tipo: 'venda',
        productId: item.productId,
        produto: product?.name || item.productId,
        de: beforeById.get(item.productId) ?? 0,
        para: product?.stockMilli ?? 0,
        quantidade: item.quantityMilli,
      })
    }
  }

  return { state: next, audit }
}

export async function persistRafaState(input: {
  storeId: string
  waId: string
  before: RafaStoreState
  after: RafaStoreState
  audit: Array<Record<string, unknown>>
}) {
  const admin = createAdminClient()
  const { data: store, error: storeError } = await admin
    .from('inventory_v1_stores')
    .select('id,business_id,installation_id')
    .eq('id', input.storeId)
    .eq('active', true)
    .maybeSingle()
  if (storeError) throw storeError
  if (!store?.installation_id) throw new Error('rafa_store_not_found')

  const { error } = await admin.rpc('inventory_v1_sync_state', {
    p_installation_id: store.installation_id,
    p_state: input.after,
    p_app_version: INVENTORY_APP_VERSION,
  })
  if (error) throw error

  if (store.business_id) {
    const events = deriveInventoryStateEvents(input.before as any, input.after as any)
    await Promise.allSettled(events.map((event) => emitPlatformEvent({
      businessId: String(store.business_id),
      storeId: String(store.id),
      type: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      data: event.data,
    })))
  }

  await Promise.allSettled(input.audit.map((entry) => writeAuditEvent({
    businessId: store.business_id ? String(store.business_id) : null,
    storeId: String(store.id),
    action: 'rafa.confirmed_change',
    entityType: 'product',
    entityId: typeof entry.productId === 'string' ? entry.productId : null,
    metadata: {
      ...entry,
      wa_id: input.waId,
      origem: 'whatsapp',
      changed_at: new Date().toISOString(),
    },
  })))
}
