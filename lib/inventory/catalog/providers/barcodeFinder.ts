import { cleanStringList, normalizeBarcode } from '../normalize'
import type { CatalogCandidate, ProviderAttempt } from '../types'
import { asRecord, fetchJsonProvider, firstRecord, pickStringList, pickText } from './shared'

export function normalizeBarcodeFinderPayload(barcode: string, payload: unknown): CatalogCandidate | null {
  const root = asRecord(payload)
  if (!root) return null
  const product = firstRecord(root.product, root.item, root.data, root)
  if (!product) return null
  const name = pickText(product, 'title', 'name', 'product_name')
  if (!name) return null

  const images = pickStringList(product, 'images', 'image_urls', 'photos')
  const imageUrl = pickText(product, 'image', 'image_url', 'imageUrl', 'thumbnail') || images[0] || ''
  const barcodeRecord = Array.isArray(root.barcodes) ? asRecord(root.barcodes[0]) : null

  return {
    barcode: normalizeBarcode(pickText(product, 'barcode', 'ean', 'gtin', 'upc'))
      || normalizeBarcode(pickText(root, 'barcode'))
      || normalizeBarcode(pickText(barcodeRecord, 'value'))
      || normalizeBarcode(barcode),
    provider: 'BarcodeFinder',
    name,
    brand: pickText(product, 'brand', 'manufacturer'),
    manufacturer: pickText(product, 'manufacturer', 'manufacturer_name'),
    categoryRaw: pickText(product, 'category', 'category_name'),
    description: pickText(product, 'description', 'summary'),
    imageUrl,
    imageUrls: cleanStringList([imageUrl, ...images]),
    model: pickText(product, 'model', 'model_number'),
    color: pickText(product, 'color', 'colour'),
    size: pickText(product, 'size'),
    weight: pickText(product, 'weight'),
    country: pickText(product, 'country', 'country_of_origin'),
    metadata: { barcodeType: pickText(root, 'type') || pickText(barcodeRecord, 'type') },
  }
}

async function request(barcode: string, url: string, signal?: AbortSignal) {
  return fetchJsonProvider({
    provider: 'BarcodeFinder',
    barcode,
    url,
    timeoutMs: 3000,
    signal,
    normalize: normalizeBarcodeFinderPayload,
  })
}

export async function lookupBarcodeFinder(barcode: string, signal?: AbortSignal): Promise<ProviderAttempt> {
  const code = normalizeBarcode(barcode)
  const primary = await request(code, `https://api.barcodefinder.info/barcode/${encodeURIComponent(code)}`, signal)
  if (primary.outcome === 'hit' || primary.outcome === 'rate_limited' || primary.outcome === 'timeout') return primary

  const fallback = await request(code, `https://www.barcodefinder.info/v1/product/${encodeURIComponent(code)}`, signal)
  if (fallback.outcome === 'hit') return fallback
  return primary.outcome === 'miss'
    ? { ...fallback, durationMs: primary.durationMs + fallback.durationMs }
    : { ...primary, durationMs: primary.durationMs + fallback.durationMs }
}
