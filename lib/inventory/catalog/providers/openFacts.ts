import { cleanStringList, cleanText, normalizeBarcode } from '../normalize'
import type { CatalogCandidate, ProviderAttempt } from '../types'
import { asRecord, fetchJsonProvider, firstRecord, pickStringList, pickText } from './shared'

export function normalizeOpenFactsPayload(barcode: string, payload: unknown): CatalogCandidate | null {
  const root = asRecord(payload)
  if (!root) return null
  const status = cleanText(root.status).toLowerCase()
  if (status && !['success', '1', 'ok'].includes(status)) return null
  const product = firstRecord(root.product, root.data)
  if (!product) return null

  const name = pickText(product, 'product_name_pt', 'product_name', 'generic_name_pt', 'generic_name', 'name', 'title')
  if (!name) return null
  const images = pickStringList(product, 'images', 'image_urls')
  const imageUrl = pickText(product, 'image_front_url', 'image_url', 'image_front_small_url') || images[0] || ''
  const categories = pickText(product, 'categories', 'categories_tags', 'category')
  const productType = pickText(product, 'product_type') || pickText(root, 'product_type')

  return {
    barcode: normalizeBarcode(pickText(product, 'code')) || normalizeBarcode(barcode),
    provider: 'OpenFacts',
    name,
    brand: pickText(product, 'brands', 'brand'),
    manufacturer: pickText(product, 'manufacturer', 'manufacturing_places'),
    categoryRaw: categories,
    description: pickText(product, 'description', 'generic_name_pt', 'generic_name'),
    imageUrl,
    imageUrls: cleanStringList([imageUrl, ...images]),
    country: pickText(product, 'countries', 'countries_tags', 'country'),
    packageDescription: pickText(product, 'packaging_text', 'packaging'),
    providerProductType: productType,
    metadata: { code: pickText(product, 'code'), productType },
  }
}

export function lookupOpenFacts(barcode: string, signal?: AbortSignal): Promise<ProviderAttempt> {
  const code = normalizeBarcode(barcode)
  return fetchJsonProvider({
    provider: 'OpenFacts',
    barcode: code,
    url: `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(code)}?product_type=all`,
    headers: { 'User-Agent': 'BALCAO/10.4 (https://rpg-capital-mp-25zw.vercel.app)' },
    timeoutMs: 3000,
    signal,
    normalize: normalizeOpenFactsPayload,
  })
}
