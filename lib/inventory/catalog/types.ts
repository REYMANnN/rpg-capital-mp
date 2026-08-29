export type GeneralCategory =
  | 'Alimentos e bebidas'
  | 'Higiene e beleza'
  | 'Limpeza'
  | 'Utilidades domésticas'
  | 'Saúde'
  | 'Vestuário'
  | 'Eletrônicos'
  | 'Pet'
  | 'Livros e mídia'
  | 'Casa e construção'
  | 'Outros'
  | 'Não classificado'

export type CatalogProvider =
  | 'OpenFacts'
  | 'ProductGuru'
  | 'BarcodeFinder'
  | 'GTINSearch'
  | 'UPCitemdb'
  | 'ProdutoXYZ'
  | 'Brocade'
  | 'EanPictures'
  | 'BALCAO'

export type ProviderOutcome =
  | 'hit'
  | 'miss'
  | 'rate_limited'
  | 'timeout'
  | 'unavailable'
  | 'invalid_response'

export type CatalogCandidate = {
  barcode: string
  name?: string
  brand?: string
  manufacturer?: string
  categoryRaw?: string
  categoryGeneral?: GeneralCategory
  description?: string
  imageUrl?: string
  imageUrls?: string[]
  model?: string
  color?: string
  size?: string
  weight?: string
  country?: string
  packageDescription?: string
  packageQuantity?: number
  ncm?: string
  cest?: string
  provider: CatalogProvider
  providerConfidence?: number
  providerProductType?: string
  metadata?: Record<string, unknown>
}

export type CatalogProduct = {
  barcode: string
  name: string
  brand: string
  manufacturer: string
  categoryRaw: string
  categoryGeneral: GeneralCategory
  description: string
  imageUrl: string
  imageUrls: string[]
  model: string
  color: string
  size: string
  weight: string
  country: string
  packageDescription: string
  packageQuantity?: number
  ncm: string
  cest: string
  confidence: number
  provenance: Record<string, CatalogProvider>
  metadata: Record<string, unknown>
}

export type ProviderAttempt = {
  provider: CatalogProvider
  outcome: ProviderOutcome
  durationMs: number
  status?: number
  candidate?: CatalogCandidate
  error?: string
}

export type CatalogResolveResult = {
  found: boolean
  barcode: string
  product?: CatalogProduct
  attempts: ProviderAttempt[]
}

export type CatalogLookup = (barcode: string, signal?: AbortSignal) => Promise<ProviderAttempt>
