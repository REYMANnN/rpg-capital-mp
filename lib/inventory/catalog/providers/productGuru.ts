import { cleanStringList, normalizeBarcode } from '../normalize'
import type { CatalogCandidate, ProviderAttempt } from '../types'
import { asRecord, fetchJsonProvider, firstRecord, normalizeConfidence, pickStringList, pickText } from './shared'

export function normalizeProductGuruPayload(barcode: string, payload: unknown): CatalogCandidate | null {
  const root = asRecord(payload)
  if (!root) return null
  const product = firstRecord(root.product, root.data, root.result, root.item, root)
  if (!product) return null
  const name = pickText(product, 'name', 'product_name', 'title', 'description_short')
  if (!name) return null

  const images = pickStringList(product, 'images', 'image_urls', 'photos')
  const imageUrl = pickText(product, 'image_url', 'image', 'imageUrl', 'thumbnail') || images[0] || ''
  const confidenceRaw = product.certa_score ?? product.certaScore ?? product.confidence ?? product.score

  return {
    barcode: normalizeBarcode(pickText(product, 'ean', 'gtin', 'barcode', 'code')) || normalizeBarcode(barcode),
    provider: 'ProductGuru',
    name,
    brand: pickText(product, 'brand', 'brand_name'),
    manufacturer: pickText(product, 'manufacturer', 'manufacturer_name', 'company'),
    categoryRaw: pickText(product, 'category', 'category_name', 'product_category'),
    description: pickText(product, 'description', 'summary'),
    imageUrl,
    imageUrls: cleanStringList([imageUrl, ...images]),
    model: pickText(product, 'model', 'model_number'),
    color: pickText(product, 'color', 'colour'),
    size: pickText(product, 'size'),
    weight: pickText(product, 'weight'),
    country: pickText(product, 'country', 'country_of_origin', 'origin_country'),
    packageDescription: pickText(product, 'packaging', 'package_description'),
    providerConfidence: normalizeConfidence(confidenceRaw),
    providerProductType: pickText(product, 'product_type', 'type'),
    metadata: { certaScore: confidenceRaw },
  }
}

export function lookupProductGuru(barcode: string, signal?: AbortSignal): Promise<ProviderAttempt> {
  const code = normalizeBarcode(barcode)
  return fetchJsonProvider({
    provider: 'ProductGuru',
    barcode: code,
    url: `https://myproduct.guru/scan/${encodeURIComponent(code)}`,
    timeoutMs: 3000,
    signal,
    normalize: normalizeProductGuruPayload,
  })
}
