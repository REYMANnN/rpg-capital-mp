import { normalizeBarcode } from '../normalize'
import type { CatalogCandidate, ProviderAttempt } from '../types'
import { asRecord, fetchJsonProvider, firstRecord, pickText } from './shared'

export function normalizeProdutoXyzPayload(barcode: string, payload: unknown): CatalogCandidate | null {
  const root = asRecord(payload)
  if (!root) return null
  const product = firstRecord(root.Product, root.product, root.data, root.item)
  if (!product) return null
  const name = pickText(product, 'name', 'nome', 'description', 'descricao')
  if (!name) return null

  return {
    barcode: normalizeBarcode(pickText(product, 'gtin', 'ean', 'barcode', 'code')) || normalizeBarcode(barcode),
    provider: 'ProdutoXYZ',
    name,
    brand: pickText(product, 'brand', 'marca'),
    manufacturer: pickText(product, 'manufacturer', 'fabricante'),
    categoryRaw: pickText(product, 'category', 'categoria'),
    description: pickText(product, 'description', 'descricao'),
    imageUrl: pickText(product, 'image_url', 'image', 'imagem'),
    metadata: { id: pickText(product, 'id') },
  }
}

async function request(code: string, url: string, signal?: AbortSignal) {
  return fetchJsonProvider({
    provider: 'ProdutoXYZ',
    barcode: code,
    url,
    timeoutMs: 2500,
    signal,
    normalize: normalizeProdutoXyzPayload,
  })
}

export async function lookupProdutoXyz(barcode: string, signal?: AbortSignal): Promise<ProviderAttempt> {
  const code = normalizeBarcode(barcode)
  const primary = await request(code, `https://produto.xyz/v1/gtin/${encodeURIComponent(code)}`, signal)
  if (primary.outcome === 'hit' || primary.outcome === 'rate_limited' || primary.outcome === 'timeout') return primary
  const fallback = await request(code, `https://api.produto.xyz/v1/gtin/${encodeURIComponent(code)}`, signal)
  return fallback.outcome === 'hit' ? fallback : primary
}
