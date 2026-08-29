import { cleanStringList, normalizeBarcode } from '../normalize'
import type { CatalogCandidate, ProviderAttempt } from '../types'
import { asRecord, fetchJsonProvider, pickStringList, pickText } from './shared'

export function normalizeUpcItemDbPayload(barcode: string, payload: unknown): CatalogCandidate | null {
  const root = asRecord(payload)
  if (!root || (typeof root.total === 'number' && root.total <= 0)) return null
  const item = Array.isArray(root.items) ? asRecord(root.items[0]) : null
  if (!item) return null
  const name = pickText(item, 'title', 'name')
  if (!name) return null
  const images = pickStringList(item, 'images')
  const imageUrl = images[0] || pickText(item, 'image_url', 'image')

  return {
    barcode: normalizeBarcode(pickText(item, 'ean', 'upc', 'gtin')) || normalizeBarcode(barcode),
    provider: 'UPCitemdb',
    name,
    brand: pickText(item, 'brand'),
    manufacturer: pickText(item, 'manufacturer'),
    categoryRaw: pickText(item, 'category'),
    description: pickText(item, 'description'),
    imageUrl,
    imageUrls: cleanStringList([imageUrl, ...images]),
    model: pickText(item, 'model'),
    color: pickText(item, 'color', 'colour'),
    size: pickText(item, 'size', 'dimension'),
    weight: pickText(item, 'weight'),
    metadata: {
      asin: pickText(item, 'asin'),
      gtin: pickText(item, 'gtin'),
      upc: pickText(item, 'upc'),
    },
  }
}

export function lookupUpcItemDb(barcode: string, signal?: AbortSignal): Promise<ProviderAttempt> {
  const code = normalizeBarcode(barcode)
  return fetchJsonProvider({
    provider: 'UPCitemdb',
    barcode: code,
    url: `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`,
    timeoutMs: 3000,
    signal,
    normalize: normalizeUpcItemDbPayload,
  })
}
