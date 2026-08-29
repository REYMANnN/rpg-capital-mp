import { cleanStringList, normalizeBarcode } from '../normalize'
import type { CatalogCandidate, ProviderAttempt } from '../types'
import { asRecord, fetchJsonProvider, firstRecord, pickStringList, pickText } from './shared'

export function normalizeGtinSearchPayload(barcode: string, payload: unknown): CatalogCandidate | null {
  const root = asRecord(payload)
  if (!root) return null
  const firstItem = Array.isArray(root.items) ? asRecord(root.items[0]) : null
  const item = firstRecord(root.item, root.product, firstItem, root)
  if (!item) return null
  const name = pickText(item, 'name', 'product_name', 'title')
  if (!name) return null

  const images = pickStringList(item, 'images', 'image_urls')
  const imageUrl = pickText(item, 'image_url', 'image', 'thumbnail') || images[0] || ''
  return {
    barcode: normalizeBarcode(pickText(item, 'ean', 'upc', 'gtin', 'gtin14', 'code')) || normalizeBarcode(barcode),
    provider: 'GTINSearch',
    name,
    brand: pickText(item, 'brand_name', 'brand'),
    manufacturer: pickText(item, 'manufacturer', 'manufacturer_name'),
    categoryRaw: pickText(item, 'category', 'category_name'),
    description: pickText(item, 'description'),
    imageUrl,
    imageUrls: cleanStringList([imageUrl, ...images]),
    size: pickText(item, 'size'),
    weight: pickText(item, 'weight'),
    country: pickText(item, 'country', 'country_of_origin'),
    metadata: { gtin14: pickText(item, 'gtin14') },
  }
}

export function lookupGtinSearch(barcode: string, signal?: AbortSignal): Promise<ProviderAttempt> {
  const code = normalizeBarcode(barcode)
  return fetchJsonProvider({
    provider: 'GTINSearch',
    barcode: code,
    url: `https://www.gtinsearch.org/api/items/${encodeURIComponent(code)}`,
    timeoutMs: 3000,
    signal,
    normalize: normalizeGtinSearchPayload,
  })
}
