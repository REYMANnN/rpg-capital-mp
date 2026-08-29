import { normalizeBarcode } from '../normalize'
import type { CatalogCandidate, ProviderAttempt } from '../types'
import { asRecord, fetchJsonProvider, firstRecord, pickNumber, pickText } from './shared'

export function normalizeEanPicturesPayload(barcode: string, payload: unknown): CatalogCandidate | null {
  const root = asRecord(payload)
  if (!root) return null
  const item = firstRecord(root.product, root.produto, root.data, root)
  if (!item) return null
  const code = normalizeBarcode(pickText(item, 'gtin', 'ean', 'codigo', 'codbar', 'barcode')) || normalizeBarcode(barcode)
  const name = pickText(item, 'descricao', 'descrição', 'description', 'nome', 'name', 'produto')
  if (!name) return null

  return {
    barcode: code,
    provider: 'EanPictures',
    name,
    brand: pickText(item, 'marca', 'brand'),
    manufacturer: pickText(item, 'fabricante', 'manufacturer'),
    categoryRaw: pickText(item, 'categoria', 'category', 'departamento'),
    description: pickText(item, 'descricao_completa', 'description', 'descricao'),
    imageUrl: `http://www.eanpictures.com.br:9000/api/gtin/${encodeURIComponent(code)}`,
    weight: pickText(item, 'peso', 'weight'),
    packageDescription: pickText(item, 'embalagem', 'package', 'unidade'),
    packageQuantity: pickNumber(item, 'quantidade', 'qtd_embalagem', 'qtd', 'package_quantity'),
    ncm: pickText(item, 'ncm', 'NCM'),
    cest: pickText(item, 'cest', 'CEST'),
    metadata: { sourceEndpoint: 'desc' },
  }
}

export function lookupEanPictures(barcode: string, signal?: AbortSignal): Promise<ProviderAttempt> {
  const code = normalizeBarcode(barcode)
  return fetchJsonProvider({
    provider: 'EanPictures',
    barcode: code,
    url: `http://www.eanpictures.com.br:9000/api/desc/${encodeURIComponent(code)}`,
    timeoutMs: 2000,
    signal,
    normalize: normalizeEanPicturesPayload,
  })
}
