import { resolveUniversalProduct } from '@/lib/inventory/catalog/resolver'
import { isValidGtin } from '@/lib/whatsapp-router'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RafaExtractedAction, RafaInvoiceExtraction } from '@/lib/rafa-ai'
import type { RafaChange, RafaInventoryProduct, RafaStoreState } from '@/lib/inventory/rafa-store'

function normalize(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function similarity(a: string, b: string) {
  const aa = new Set(normalize(a).split(' ').filter((token) => token.length > 1))
  const bb = new Set(normalize(b).split(' ').filter((token) => token.length > 1))
  if (!aa.size || !bb.size) return 0
  let hit = 0
  for (const token of aa) if (bb.has(token)) hit += 1
  return hit / Math.max(aa.size, bb.size)
}

export type RafaProductCandidate = {
  id?: string
  barcode: string
  name: string
  brand?: string
  priceCents?: number
  source: 'store_ean' | 'supplier_map' | 'store_similarity' | 'catalog'
}

export type RafaProductResolution =
  | { status: 'resolved'; candidate: RafaProductCandidate }
  | { status: 'ambiguous'; candidates: RafaProductCandidate[] }
  | { status: 'new'; candidate: RafaProductCandidate }
  | { status: 'unresolved'; candidates: RafaProductCandidate[] }

function storeCandidate(product: RafaInventoryProduct, source: RafaProductCandidate['source']): RafaProductCandidate {
  return {
    id: product.id,
    barcode: product.barcode,
    name: product.name,
    brand: product.catalogBrand,
    priceCents: product.priceCents,
    source,
  }
}

function bestStoreMatches(products: RafaInventoryProduct[], description: string) {
  return products
    .filter((product) => !product.deletedAt)
    .map((product) => ({ product, score: similarity(description, product.name) }))
    .filter((entry) => entry.score >= 0.35)
    .sort((a, b) => b.score - a.score)
}

async function catalogMatches(description: string) {
  const admin = createAdminClient()
  const words = normalize(description).split(' ').filter((word) => word.length >= 3).slice(0, 3)
  if (!words.length) return [] as RafaProductCandidate[]
  const { data } = await admin.from('inventory_v1_product_catalog_cache')
    .select('barcode,name,brand,cache_status')
    .ilike('name', `%${words[0]}%`)
    .eq('cache_status', 'hit')
    .limit(30)
  return (data || [])
    .map((row) => ({ row, score: similarity(description, String(row.name || '')) }))
    .filter((entry) => entry.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ row }) => ({
      barcode: String(row.barcode),
      name: String(row.name),
      brand: String(row.brand || ''),
      source: 'catalog' as const,
    }))
}

export async function resolveRafaInvoiceProduct(input: {
  state: RafaStoreState
  supplierCnpj?: string | null
  supplierCode?: string | null
  description?: string | null
  ean?: string | null
}): Promise<RafaProductResolution> {
  const ean = String(input.ean || '').replace(/\D/g, '')
  if (ean && isValidGtin(ean)) {
    const existing = input.state.products.find((product) => product.barcode === ean && !product.deletedAt)
    if (existing) return { status: 'resolved', candidate: storeCandidate(existing, 'store_ean') }

    try {
      const external = await resolveUniversalProduct(ean)
      if (external.found && external.product?.name) {
        return {
          status: 'new',
          candidate: {
            barcode: ean,
            name: String(external.product.name),
            brand: String(external.product.brand || ''),
            source: 'catalog',
          },
        }
      }
    } catch {}
  }

  const supplierCnpj = String(input.supplierCnpj || '').replace(/\D/g, '')
  const supplierCode = String(input.supplierCode || '').trim()
  if (supplierCnpj && supplierCode) {
    const admin = createAdminClient()
    const { data } = await admin.from('supplier_product_map')
      .select('produto_id,ean,descricao_original')
      .eq('fornecedor_cnpj', supplierCnpj)
      .eq('codigo_fornecedor', supplierCode)
      .maybeSingle()
    const mappedBarcode = String(data?.ean || data?.produto_id || '').replace(/\D/g, '')
    if (mappedBarcode) {
      const existing = input.state.products.find((product) => product.barcode === mappedBarcode && !product.deletedAt)
      if (existing) return { status: 'resolved', candidate: storeCandidate(existing, 'supplier_map') }
      const admin2 = createAdminClient()
      const { data: catalog } = await admin2.from('inventory_v1_product_catalog_cache')
        .select('barcode,name,brand')
        .eq('barcode', mappedBarcode)
        .maybeSingle()
      if (catalog?.barcode) {
        return {
          status: 'new',
          candidate: {
            barcode: String(catalog.barcode),
            name: String(catalog.name),
            brand: String(catalog.brand || ''),
            source: 'supplier_map',
          },
        }
      }
    }
  }

  const description = String(input.description || '').trim()
  if (description) {
    const local = bestStoreMatches(input.state.products, description)
    if (local[0]?.score >= 0.78 && (!local[1] || local[0].score - local[1].score >= 0.18)) {
      return { status: 'resolved', candidate: storeCandidate(local[0].product, 'store_similarity') }
    }
    const likely = local.filter((entry) => entry.score >= 0.55).slice(0, 3)
    if (likely.length >= 2) {
      return { status: 'ambiguous', candidates: likely.map((entry) => storeCandidate(entry.product, 'store_similarity')) }
    }

    const catalog = await catalogMatches(description)
    if (catalog.length === 1) return { status: 'new', candidate: catalog[0] }
    if (catalog.length >= 2) return { status: 'ambiguous', candidates: catalog }
  }

  return { status: 'unresolved', candidates: [] }
}

export async function rememberSupplierProduct(input: {
  supplierCnpj: string
  supplierCode: string
  description: string
  barcode: string
}) {
  const fornecedor_cnpj = input.supplierCnpj.replace(/\D/g, '')
  const codigo_fornecedor = input.supplierCode.trim()
  const ean = input.barcode.replace(/\D/g, '')
  if (!fornecedor_cnpj || !codigo_fornecedor || !ean) return
  const admin = createAdminClient()
  const { data: existing } = await admin.from('supplier_product_map')
    .select('id,confirmacoes')
    .eq('fornecedor_cnpj', fornecedor_cnpj)
    .eq('codigo_fornecedor', codigo_fornecedor)
    .maybeSingle()
  const { data: catalogProduct } = await admin.from('inventory_v1_product_catalog_cache')
    .select('barcode')
    .eq('barcode', ean)
    .maybeSingle()
  const row = {
    fornecedor_cnpj,
    codigo_fornecedor,
    descricao_original: input.description.slice(0, 500),
    produto_id: catalogProduct?.barcode ? ean : null,
    ean,
    confirmacoes: Math.max(1, Number(existing?.confirmacoes || 0) + 1),
    atualizado_em: new Date().toISOString(),
  }
  const { error } = await admin.from('supplier_product_map').upsert(row, { onConflict: 'fornecedor_cnpj,codigo_fornecedor' })
  if (error) throw error
}

export async function resolveInvoiceExtraction(state: RafaStoreState, extraction: RafaInvoiceExtraction) {
  const lines = []
  for (const item of extraction.items || []) {
    const resolution = await resolveRafaInvoiceProduct({
      state,
      supplierCnpj: extraction.supplier_cnpj,
      supplierCode: item.supplier_code,
      description: item.description,
      ean: item.ean,
    })
    lines.push({ ...item, resolution })
  }
  return {
    supplier_name: extraction.supplier_name || null,
    supplier_cnpj: String(extraction.supplier_cnpj || '').replace(/\D/g, '') || null,
    lines,
  }
}

export function resolveTextProduct(products: RafaInventoryProduct[], reference: string): RafaProductResolution {
  const numeric = reference.replace(/\D/g, '')
  if (numeric && isValidGtin(numeric)) {
    const exact = products.find((product) => product.barcode === numeric && !product.deletedAt)
    if (exact) return { status: 'resolved', candidate: storeCandidate(exact, 'store_ean') }
  }
  const matches = bestStoreMatches(products, reference)
  if (matches[0]?.score >= 0.78 && (!matches[1] || matches[0].score - matches[1].score >= 0.18)) {
    return { status: 'resolved', candidate: storeCandidate(matches[0].product, 'store_similarity') }
  }
  const likely = matches.filter((entry) => entry.score >= 0.5).slice(0, 3)
  if (likely.length) return { status: 'ambiguous', candidates: likely.map((entry) => storeCandidate(entry.product, 'store_similarity')) }
  return { status: 'unresolved', candidates: [] }
}

export function actionToChange(action: RafaExtractedAction, product: RafaInventoryProduct): RafaChange | null {
  if (action.tipo === 'preco' && Number.isInteger(action.valor_novo_centavos)) {
    return {
      kind: 'preco',
      productId: product.id,
      expectedPriceCents: product.priceCents,
      newPriceCents: Number(action.valor_novo_centavos),
      reason: action.motivo,
    }
  }
  if (action.tipo === 'estoque' && Number.isInteger(action.estoque_novo_milli)) {
    return {
      kind: 'estoque',
      productId: product.id,
      expectedStockMilli: product.stockMilli,
      newStockMilli: Number(action.estoque_novo_milli),
      reason: action.motivo,
    }
  }
  if (action.tipo === 'entrada' && Number.isInteger(action.quantidade_milli) && Number.isInteger(action.custo_unitario_centavos)) {
    return {
      kind: 'entrada',
      productId: product.id,
      expectedStockMilli: product.stockMilli,
      quantityMilli: Number(action.quantidade_milli),
      unitCostCents: Number(action.custo_unitario_centavos),
      reason: action.motivo,
    }
  }
  if (action.tipo === 'venda' && Number.isInteger(action.quantidade_milli)) {
    return {
      kind: 'venda',
      productId: product.id,
      expectedStockMilli: product.stockMilli,
      quantityMilli: Number(action.quantidade_milli),
      paymentMethod: action.forma_pagamento,
      reason: action.motivo,
    }
  }
  return null
}
