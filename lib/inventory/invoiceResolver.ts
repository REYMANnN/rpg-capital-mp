import type { ParsedNfeItem } from './nfe'
import {
  inferPackageFactor,
  normalizePurchaseUnit,
  recalculateInvoiceLine,
  requiresPackageFactor,
  type DecisionState,
  type InvoiceReviewLineV10,
  type StoreStatus,
} from './invoiceReview'
import { rankProductCandidates, type ProductCandidate } from './productMatcher'

export type ResolverProduct = ProductCandidate & {
  id?: string
  priceCents?: number
  unit?: 'UN' | 'KG'
  local?: boolean
}

export type SupplierAliasCandidate = {
  barcode: string
  canonicalName?: string
  observedDescription?: string
  purchaseUnit?: string
  packageFactor?: number
  confirmations?: number
  revisions?: number
}

export type ResolveInvoiceLineInput = {
  item: ParsedNfeItem
  localProducts: ResolverProduct[]
  catalogCandidates: ResolverProduct[]
  alias?: SupplierAliasCandidate | null
}

function storeStatus(product: ResolverProduct | undefined): StoreStatus {
  if (!product?.id) return 'new'
  return (product.priceCents ?? 0) > 0 ? 'existing-priced' : 'existing-unpriced'
}

function exactProduct(barcode: string, localProducts: ResolverProduct[], catalogCandidates: ResolverProduct[]) {
  return localProducts.find((product) => product.barcode === barcode)
    || catalogCandidates.find((product) => product.barcode === barcode)
}

function pickRanked(description: string, candidates: ResolverProduct[]) {
  const ranked = rankProductCandidates(description, candidates)
  const best = ranked[0]
  if (!best || best.score < 0.72) return null
  const second = ranked[1]
  if (second && best.score - second.score < 0.08) return null
  return best
}

function pickSuggestion(description: string, localProducts: ResolverProduct[], catalogCandidates: ResolverProduct[]) {
  const local = pickRanked(description, localProducts)
  if (local) return { ...local, local: true }
  const global = pickRanked(description, catalogCandidates)
  return global ? { ...global, local: false } : null
}

function packageState(item: ParsedNfeItem, alias: SupplierAliasCandidate | null | undefined, aliasIsValid: boolean) {
  const purchaseUnit = normalizePurchaseUnit(item.purchaseUnit)
  if (!requiresPackageFactor(purchaseUnit)) return { factor: 1, pending: false }

  const aliasUnit = normalizePurchaseUnit(alias?.purchaseUnit)
  const aliasFactor = aliasIsValid && aliasUnit === purchaseUnit && Number(alias?.packageFactor) > 0
    ? Number(alias?.packageFactor)
    : 0
  if (aliasFactor > 0) return { factor: aliasFactor, pending: false }

  const inferred = inferPackageFactor(item.description)
  return { factor: inferred, pending: true }
}

function buildLine(
  item: ParsedNfeItem,
  product: ResolverProduct | undefined,
  fields: Partial<InvoiceReviewLineV10>,
) {
  const purchaseUnit = normalizePurchaseUnit(item.purchaseUnit)
  const base: InvoiceReviewLineV10 = {
    ...item,
    purchaseUnit,
    barcode: fields.barcode ?? item.barcode,
    name: fields.name ?? product?.name ?? item.description,
    brand: fields.brand ?? product?.brand ?? '',
    imageUrl: fields.imageUrl ?? product?.imageUrl ?? '',
    source: fields.source ?? product?.source ?? 'NF-e',
    resolution: fields.resolution ?? 'unresolved',
    identityStatus: fields.identityStatus ?? 'unresolved',
    storeStatus: fields.storeStatus ?? storeStatus(product),
    decisionState: fields.decisionState ?? 'needs-identity',
    confirmed: fields.confirmed ?? false,
    selected: fields.selected ?? true,
    productId: fields.productId ?? product?.id,
    packageFactor: fields.packageFactor ?? 1,
    stockQuantityMilli: fields.stockQuantityMilli ?? item.quantityMilli,
    inventoryUnitCostCents: fields.inventoryUnitCostCents ?? item.unitCostCents,
    inventoryUnit: fields.inventoryUnit ?? (purchaseUnit === 'KG' ? 'KG' : 'UN'),
    salePriceCents: fields.salePriceCents ?? product?.priceCents ?? 0,
    conflictingAliasBarcode: fields.conflictingAliasBarcode,
    aliasObservedDescription: fields.aliasObservedDescription,
    aliasWritePending: fields.aliasWritePending,
  }
  return recalculateInvoiceLine(base)
}

export function resolveInvoiceLine({ item, localProducts, catalogCandidates, alias }: ResolveInvoiceLineInput) {
  const explicitBarcode = item.barcode
  const aliasConflict = Boolean(explicitBarcode && alias?.barcode && alias.barcode !== explicitBarcode)

  if (explicitBarcode) {
    const product = exactProduct(explicitBarcode, localProducts, catalogCandidates)
    const pack = packageState(item, alias, !aliasConflict && alias?.barcode === explicitBarcode)
    const decisionState: DecisionState = aliasConflict
      ? 'needs-identity'
      : pack.pending ? 'needs-package-factor' : 'resolved'

    return buildLine(item, product, {
      barcode: explicitBarcode,
      name: product?.name || item.description,
      source: aliasConflict
        ? 'Conflito: EAN da NF-e difere do histórico do fornecedor'
        : product?.id ? 'EAN · já cadastrado neste mercado' : product?.source || 'EAN da NF-e',
      resolution: aliasConflict ? 'conflict' : 'ean',
      identityStatus: aliasConflict ? 'conflict' : 'ean',
      decisionState,
      confirmed: decisionState === 'resolved',
      packageFactor: pack.factor,
      conflictingAliasBarcode: aliasConflict ? alias!.barcode : undefined,
      aliasObservedDescription: aliasConflict ? alias?.observedDescription : undefined,
    })
  }

  if (alias?.barcode) {
    const product = exactProduct(alias.barcode, localProducts, catalogCandidates)
    const pack = packageState(item, alias, true)
    const decisionState: DecisionState = pack.pending ? 'needs-package-factor' : 'resolved'
    return buildLine(item, product, {
      barcode: alias.barcode,
      name: product?.name || alias.canonicalName || item.description,
      source: product?.id ? 'Fornecedor + cProd · já cadastrado neste mercado' : 'Fornecedor + cProd conhecido globalmente',
      resolution: 'alias',
      identityStatus: 'alias',
      decisionState,
      confirmed: decisionState === 'resolved',
      packageFactor: pack.factor,
      aliasObservedDescription: alias.observedDescription,
    })
  }

  const suggestion = pickSuggestion(item.description, localProducts, catalogCandidates)
  if (suggestion) {
    const candidate = suggestion.candidate as ResolverProduct
    const pack = packageState(item, null, false)
    return buildLine(item, candidate, {
      barcode: candidate.barcode,
      name: candidate.name,
      source: suggestion.local
        ? `Sugestão · já cadastrado neste mercado · ${Math.round(suggestion.score * 100)}%`
        : `Sugestão do catálogo · ${Math.round(suggestion.score * 100)}%`,
      resolution: 'suggested',
      identityStatus: 'suggested',
      decisionState: 'needs-identity',
      confirmed: false,
      packageFactor: pack.factor,
    })
  }

  return buildLine(item, undefined, {
    barcode: '',
    name: item.description,
    source: 'Não identificado',
    resolution: 'unresolved',
    identityStatus: 'unresolved',
    storeStatus: 'new',
    decisionState: 'needs-identity',
    confirmed: false,
    packageFactor: packageState(item, null, false).factor,
  })
}
