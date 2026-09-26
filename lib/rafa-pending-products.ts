import { createAdminClient } from '@/lib/supabase/admin'
import type { PendingNewProduct, PendingProductRow } from '@/lib/rafa-invoice-plan'

// Produtos novos da nota que esperam o preço de venda do lojista.

export type PendingProduct = PendingProductRow & { id: string; asked_at: string | null }

export async function savePendingProducts(input: {
  storeId: string
  waId: string
  invoiceImportId?: string | null
  items: PendingNewProduct[]
}) {
  if (!input.items.length) return
  const admin = createAdminClient()
  const barcodes = input.items.map((item) => item.barcode)
  const { data: open } = await admin.from('rafa_pending_products')
    .select('id,barcode,quantity_milli,cost_cents')
    .eq('store_id', input.storeId)
    .eq('status', 'aguardando_preco')
    .in('barcode', barcodes)
  const byBarcode = new Map((open || []).map((row) => [String(row.barcode), row]))
  const now = new Date().toISOString()
  for (const item of input.items) {
    const existing = byBarcode.get(item.barcode)
    if (existing) {
      const quantity = Number(existing.quantity_milli) + item.quantityMilli
      const cost = Math.round((Number(existing.cost_cents) * Number(existing.quantity_milli) + item.costCents * item.quantityMilli) / Math.max(1, quantity))
      await admin.from('rafa_pending_products').update({
        quantity_milli: quantity, cost_cents: cost, asked_at: null, updated_at: now,
      }).eq('id', existing.id)
    } else {
      await admin.from('rafa_pending_products').insert({
        store_id: input.storeId,
        wa_id: input.waId,
        invoice_import_id: input.invoiceImportId || null,
        barcode: item.barcode,
        name: item.name,
        brand: item.brand || null,
        quantity_milli: item.quantityMilli,
        cost_cents: item.costCents,
      })
    }
  }
}

export async function listPendingProducts(storeId: string): Promise<PendingProduct[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('rafa_pending_products')
    .select('id,barcode,name,quantity_milli,cost_cents,asked_at')
    .eq('store_id', storeId)
    .eq('status', 'aguardando_preco')
    .order('created_at', { ascending: true })
    .limit(60)
  return (data || []).map((row) => ({
    id: String(row.id),
    barcode: String(row.barcode),
    name: String(row.name),
    quantity_milli: Number(row.quantity_milli),
    cost_cents: Number(row.cost_cents),
    asked_at: row.asked_at ? String(row.asked_at) : null,
  }))
}

export async function markPendingAsked(ids: string[]) {
  if (!ids.length) return
  const admin = createAdminClient()
  await admin.from('rafa_pending_products').update({ asked_at: new Date().toISOString() }).in('id', ids)
}

// Depois do Sim no cadastro: some da lista de espera.
export async function markPendingRegistered(storeId: string, barcodes: string[]) {
  if (!barcodes.length) return
  const admin = createAdminClient()
  await admin.from('rafa_pending_products')
    .update({ status: 'cadastrado', updated_at: new Date().toISOString() })
    .eq('store_id', storeId)
    .eq('status', 'aguardando_preco')
    .in('barcode', barcodes)
}
