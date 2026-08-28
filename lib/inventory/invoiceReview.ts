import type { ParsedNfeItem } from './nfe'

export type InvoiceResolution = 'ean' | 'alias' | 'suggested' | 'manual' | 'unresolved'

export type InvoiceReviewLineV10 = ParsedNfeItem & {
  name: string
  brand: string
  imageUrl: string
  source: string
  resolution: InvoiceResolution
  confirmed: boolean
  selected: boolean
  productId?: string
}

export function editInvoiceReviewLine(line: InvoiceReviewLineV10, patch: Partial<InvoiceReviewLineV10>) {
  const next = { ...line, ...patch }
  return {
    ...next,
    totalCents: Math.round((next.quantityMilli * next.unitCostCents) / 1000),
  }
}

export function importableInvoiceLines(lines: InvoiceReviewLineV10[]) {
  return lines.filter((line) => line.selected && line.confirmed && Boolean(line.barcode))
}

export function pendingInvoiceLines(lines: InvoiceReviewLineV10[]) {
  return lines.filter((line) => !line.confirmed || !line.barcode)
}
