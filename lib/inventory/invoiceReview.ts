import type { ParsedNfeItem } from './nfe'

export type InvoiceResolution = 'ean' | 'alias' | 'suggested' | 'manual' | 'unresolved' | 'conflict'
export type IdentityStatus = InvoiceResolution
export type StoreStatus = 'existing-priced' | 'existing-unpriced' | 'new'
export type DecisionState = 'resolved' | 'needs-identity' | 'needs-package-factor' | 'excluded'
export type InventoryUnit = 'UN' | 'KG'

export type InvoiceReviewLineV10 = ParsedNfeItem & {
  name: string
  brand: string
  imageUrl: string
  source: string
  resolution: InvoiceResolution
  identityStatus: IdentityStatus
  storeStatus: StoreStatus
  decisionState: DecisionState
  confirmed: boolean
  selected: boolean
  productId?: string
  packageFactor: number
  stockQuantityMilli: number
  inventoryUnitCostCents: number
  inventoryUnit: InventoryUnit
  salePriceCents: number
  conflictingAliasBarcode?: string
  aliasObservedDescription?: string
  aliasWritePending?: boolean
}

const UNIT_ALIASES: Record<string, string> = {
  UN: 'UN', UND: 'UN', UNID: 'UN', UNIDADE: 'UN', UNIDADES: 'UN', PC: 'UN', PÇ: 'UN', PECA: 'UN', PEÇA: 'UN',
  KG: 'KG', KGS: 'KG', QUILO: 'KG', QUILOS: 'KG',
  CX: 'CX', CAIXA: 'CX', CAIXAS: 'CX',
  FD: 'FD', FARDO: 'FD', FARDOS: 'FD',
  PCT: 'PCT', PACOTE: 'PCT', PACOTES: 'PCT',
  DP: 'DISPLAY', DISPLAY: 'DISPLAY', DISPLAYS: 'DISPLAY',
}

export function normalizePurchaseUnit(value: string | null | undefined) {
  const raw = String(value ?? '').trim().toUpperCase()
  return UNIT_ALIASES[raw] || raw || 'UN'
}

export function requiresPackageFactor(unit: string | null | undefined) {
  const normalized = normalizePurchaseUnit(unit)
  return normalized !== 'UN' && normalized !== 'KG'
}

export function inferPackageFactor(description: string | null | undefined) {
  const text = String(description ?? '').toUpperCase().replace(/\s+/g, ' ')
  const patterns = [
    /(?:C\/|COM\s+|CX\s*|CAIXA\s*|FD\s*|FARDO\s*|PCT\s*|PACOTE\s*)(\d{1,3})\s*(?:UN|UND|UNID|UNIDADES?)\b/,
    /\b(\d{1,3})\s*[Xx]\s*\d+(?:[.,]\d+)?\s*(?:ML|L|G|KG)\b/,
    /\b(\d{1,3})\s*(?:UN|UND|UNID|UNIDADES?)\s*(?:\/|POR)?\s*(?:CX|CAIXA|FD|FARDO|PCT|PACOTE)\b/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    const value = match ? Number(match[1]) : 0
    if (Number.isInteger(value) && value > 1 && value <= 500) return value
  }
  return 0
}

export function recalculateInvoiceLine<T extends InvoiceReviewLineV10>(line: T): T {
  const purchaseUnit = normalizePurchaseUnit(line.purchaseUnit)
  const direct = !requiresPackageFactor(purchaseUnit)
  const factor = direct ? 1 : (Number.isFinite(line.packageFactor) && line.packageFactor > 0 ? line.packageFactor : 0)
  const inventoryUnit: InventoryUnit = purchaseUnit === 'KG' ? 'KG' : 'UN'
  const stockQuantityMilli = factor > 0 ? Math.round(line.quantityMilli * factor) : 0
  const inventoryUnitCostCents = factor > 0 ? Math.round(line.unitCostCents / factor) : 0
  const totalCents = Math.round((line.quantityMilli * line.unitCostCents) / 1000)
  return {
    ...line,
    purchaseUnit,
    packageFactor: factor,
    inventoryUnit,
    stockQuantityMilli,
    inventoryUnitCostCents,
    totalCents,
  }
}

export function editInvoiceReviewLine(line: InvoiceReviewLineV10, patch: Partial<InvoiceReviewLineV10>) {
  return recalculateInvoiceLine({ ...line, ...patch })
}

export function isInvoiceLineDecisionComplete(line: InvoiceReviewLineV10) {
  return line.decisionState === 'resolved' || line.decisionState === 'excluded'
}

export function importableInvoiceLines(lines: InvoiceReviewLineV10[]) {
  return lines.filter((line) =>
    line.selected &&
    line.decisionState === 'resolved' &&
    Boolean(line.barcode) &&
    line.stockQuantityMilli > 0,
  )
}

export function pendingInvoiceLines(lines: InvoiceReviewLineV10[]) {
  return lines.filter((line) => !isInvoiceLineDecisionComplete(line))
}
