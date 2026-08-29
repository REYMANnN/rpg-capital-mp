import { classifyGeneralCategory } from './category'
import { cleanStringList, cleanText } from './normalize'
import type { CatalogCandidate, CatalogProduct, CatalogProvider } from './types'

const RANK: Record<CatalogProvider, number> = {
  BALCAO: 100,
  ProductGuru: 95,
  EanPictures: 90,
  OpenFacts: 88,
  ProdutoXYZ: 84,
  GTINSearch: 80,
  UPCitemdb: 78,
  BarcodeFinder: 72,
  Brocade: 55,
}

type CanonicalSeed = Partial<CatalogProduct> & { authority?: 'manual' | 'external' }

function betterCandidates(candidates: CatalogCandidate[]) {
  return [...candidates].sort((a, b) => (RANK[b.provider] ?? 0) - (RANK[a.provider] ?? 0))
}

function nameInformationScore(candidate: CatalogCandidate) {
  const name = cleanText(candidate.name)
  if (!name) return Number.NEGATIVE_INFINITY
  const tokens = name.split(/\s+/).filter(Boolean)
  const supportingFields = [
    candidate.brand,
    candidate.manufacturer,
    candidate.categoryRaw,
    candidate.description,
    candidate.model,
    candidate.size,
    candidate.weight,
    candidate.packageDescription,
    candidate.ncm,
  ].filter((value) => cleanText(value)).length

  const descriptiveLength = Math.min(24, Math.max(0, name.length - 8) * 0.7)
  const tokenBonus = Math.min(12, Math.max(0, tokens.length - 1) * 4)
  const supportBonus = Math.min(12, supportingFields * 2)
  const genericPenalty = tokens.length === 1 && name.length <= 12 && supportingFields === 0 ? 20 : 0

  return (RANK[candidate.provider] ?? 0) + descriptiveLength + tokenBonus + supportBonus - genericPenalty
}

function bestNameCandidate(candidates: CatalogCandidate[]) {
  return [...candidates]
    .filter((candidate) => cleanText(candidate.name))
    .sort((a, b) => nameInformationScore(b) - nameInformationScore(a))[0]
}

function accept(
  product: Record<string, unknown>,
  provenance: Record<string, CatalogProvider>,
  key: string,
  raw: unknown,
  provider: CatalogProvider,
) {
  if (product[key]) return
  const value = cleanText(raw)
  if (!value) return
  product[key] = value
  provenance[key] = provider
}

export function mergeCatalogCandidates(
  barcode: string,
  candidates: CatalogCandidate[],
  canonical?: CanonicalSeed,
): CatalogProduct | null {
  const product: Record<string, unknown> = { barcode }
  const provenance: Record<string, CatalogProvider> = {}
  const manual = canonical?.authority === 'manual'

  if (manual && canonical) {
    for (const key of ['name', 'brand', 'manufacturer', 'categoryRaw', 'description', 'imageUrl', 'model', 'color', 'size', 'weight', 'country', 'packageDescription', 'ncm', 'cest'] as const) {
      accept(product, provenance, key, canonical[key], 'BALCAO')
    }
  }

  const sorted = betterCandidates(candidates)
  if (!manual || !cleanText(product.name)) {
    const nameCandidate = bestNameCandidate(sorted)
    if (nameCandidate) accept(product, provenance, 'name', nameCandidate.name, nameCandidate.provider)
  }

  for (const candidate of sorted) {
    accept(product, provenance, 'name', candidate.name, candidate.provider)
    accept(product, provenance, 'brand', candidate.brand, candidate.provider)
    accept(product, provenance, 'manufacturer', candidate.manufacturer, candidate.provider)
    accept(product, provenance, 'categoryRaw', candidate.categoryRaw, candidate.provider)
    accept(product, provenance, 'description', candidate.description, candidate.provider)
    accept(product, provenance, 'imageUrl', candidate.imageUrl, candidate.provider)
    accept(product, provenance, 'model', candidate.model, candidate.provider)
    accept(product, provenance, 'color', candidate.color, candidate.provider)
    accept(product, provenance, 'size', candidate.size, candidate.provider)
    accept(product, provenance, 'weight', candidate.weight, candidate.provider)
    accept(product, provenance, 'country', candidate.country, candidate.provider)
    accept(product, provenance, 'packageDescription', candidate.packageDescription, candidate.provider)
    accept(product, provenance, 'ncm', candidate.ncm, candidate.provider)
    accept(product, provenance, 'cest', candidate.cest, candidate.provider)
    if (!product.packageQuantity && Number.isFinite(candidate.packageQuantity) && Number(candidate.packageQuantity) > 0) {
      product.packageQuantity = Number(candidate.packageQuantity)
      provenance.packageQuantity = candidate.provider
    }
  }

  if (!cleanText(product.name)) return null

  const imageUrls = cleanStringList([
    canonical?.imageUrl,
    ...(canonical?.imageUrls ?? []),
    ...sorted.flatMap((candidate) => [candidate.imageUrl, ...(candidate.imageUrls ?? [])]),
  ])
  if (!product.imageUrl && imageUrls[0]) {
    product.imageUrl = imageUrls[0]
    const source = sorted.find((candidate) => cleanStringList([candidate.imageUrl, ...(candidate.imageUrls ?? [])]).includes(imageUrls[0]))
    if (source) provenance.imageUrl = source.provider
  }

  const categoryGeneral = canonical?.categoryGeneral && canonical.categoryGeneral !== 'Não classificado'
    ? canonical.categoryGeneral
    : sorted.find((candidate) => candidate.categoryGeneral && candidate.categoryGeneral !== 'Não classificado')?.categoryGeneral
      ?? classifyGeneralCategory(
        cleanText(product.categoryRaw),
        ...sorted.map((candidate) => candidate.providerProductType),
        cleanText(product.description),
        cleanText(product.name),
      )
  if (manual && canonical?.categoryGeneral) provenance.categoryGeneral = 'BALCAO'

  const names = sorted.map((candidate) => cleanText(candidate.name).toLowerCase()).filter(Boolean)
  const selectedName = cleanText(product.name).toLowerCase()
  const agreement = selectedName ? names.filter((name) => name === selectedName).length : 0
  const topSource = provenance.name ?? 'BALCAO'
  const base = Math.min(0.95, (RANK[topSource] ?? 50) / 100)
  const completeness = ['brand', 'manufacturer', 'categoryRaw', 'imageUrl'].filter((key) => cleanText(product[key])).length * 0.025
  const confidence = Math.max(0, Math.min(1, Number((base + Math.min(agreement - 1, 2) * 0.03 + completeness).toFixed(3))))

  return {
    barcode,
    name: cleanText(product.name),
    brand: cleanText(product.brand),
    manufacturer: cleanText(product.manufacturer),
    categoryRaw: cleanText(product.categoryRaw),
    categoryGeneral,
    description: cleanText(product.description),
    imageUrl: cleanText(product.imageUrl),
    imageUrls,
    model: cleanText(product.model),
    color: cleanText(product.color),
    size: cleanText(product.size),
    weight: cleanText(product.weight),
    country: cleanText(product.country),
    packageDescription: cleanText(product.packageDescription),
    packageQuantity: Number.isFinite(product.packageQuantity) ? Number(product.packageQuantity) : undefined,
    ncm: cleanText(product.ncm),
    cest: cleanText(product.cest),
    confidence,
    provenance,
    metadata: {
      providers: sorted.map((candidate) => candidate.provider),
      candidates: sorted.map((candidate) => ({ ...candidate })),
    },
  }
}
