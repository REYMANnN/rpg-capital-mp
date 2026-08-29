import { normalizeBarcode } from '../normalize'
import type { CatalogCandidate, ProviderAttempt } from '../types'
import { asRecord, fetchJsonProvider, pickText } from './shared'

export function normalizeBrocadePayload(barcode: string, payload: unknown): CatalogCandidate | null {
  const item = asRecord(payload)
  if (!item) return null
  const name = pickText(item, 'name', 'product_name', 'title')
  if (!name) return null

  return {
    barcode: normalizeBarcode(pickText(item, 'gtin14', 'gtin', 'ean', 'upc')) || normalizeBarcode(barcode),
    provider: 'Brocade',
    name,
    brand: pickText(item, 'brand_name', 'brand'),
    manufacturer: pickText(item, 'manufacturer', 'publisher'),
    categoryRaw: pickText(item, 'category', 'product_type'),
    description: pickText(item, 'description'),
    size: pickText(item, 'size', 'serving_size'),
    weight: pickText(item, 'weight'),
    metadata: {
      author: pickText(item, 'author'),
      publisher: pickText(item, 'publisher'),
      pages: item.pages,
    },
  }
}

export function lookupBrocade(barcode: string, signal?: AbortSignal): Promise<ProviderAttempt> {
  const code = normalizeBarcode(barcode)
  return fetchJsonProvider({
    provider: 'Brocade',
    barcode: code,
    url: `https://www.brocade.io/api/items/${encodeURIComponent(code)}`,
    timeoutMs: 2000,
    signal,
    normalize: normalizeBrocadePayload,
  })
}
