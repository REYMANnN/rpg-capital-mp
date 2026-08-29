import { cleanText } from './normalize'
import type { CatalogResolveResult, GeneralCategory } from './types'

export type CatalogCacheRow = {
  barcode: string
  name: string
  brand: string
  image_url: string
  source: string
  raw_metadata: Record<string, unknown>
  system_tag?: string
  checked_at: string
  manufacturer?: string | null
  category_general?: string | null
  category_raw?: string | null
  confidence_score?: number | string | null
  cache_status?: 'hit' | 'miss' | string | null
  miss_expires_at?: string | null
  canonical_updated_at?: string | null
}

export function isUsableCacheHit(row: CatalogCacheRow | null | undefined) {
  return Boolean(row && row.cache_status !== 'miss' && cleanText(row.name))
}

export function isFreshNegativeCache(row: CatalogCacheRow | null | undefined, now = Date.now()) {
  if (!row || row.cache_status !== 'miss' || !row.miss_expires_at) return false
  const expiry = Date.parse(row.miss_expires_at)
  return Number.isFinite(expiry) && expiry > now
}

function optionalText<T extends Record<string, unknown>>(target: T, key: string, value: unknown) {
  const text = cleanText(value)
  if (text) target[key as keyof T] = text as T[keyof T]
}

export function cacheRowToLookupResponse(row: CatalogCacheRow) {
  if (!isUsableCacheHit(row)) {
    return { found: false as const, barcode: row.barcode, cached: true as const }
  }

  const product: Record<string, unknown> = {
    barcode: row.barcode,
    name: row.name,
    brand: row.brand || '',
    imageUrl: row.image_url || '',
  }
  optionalText(product, 'manufacturer', row.manufacturer)
  optionalText(product, 'categoryGeneral', row.category_general)
  optionalText(product, 'categoryRaw', row.category_raw)
  if (row.confidence_score !== null && row.confidence_score !== undefined && Number.isFinite(Number(row.confidence_score))) {
    product.confidence = Number(row.confidence_score)
  }

  return {
    found: true as const,
    source: row.source,
    cached: true as const,
    product,
  }
}

export function resolutionToCacheRow(result: CatalogResolveResult, checkedAt = new Date()): CatalogCacheRow {
  if (!result.found || !result.product) throw new Error('resolved product required')
  const product = result.product
  const source = product.provenance.name
    || result.attempts.find((attempt) => attempt.outcome === 'hit')?.provider
    || 'BALCAO'
  const timestamp = checkedAt.toISOString()

  return {
    barcode: product.barcode,
    name: product.name,
    brand: product.brand || '',
    image_url: product.imageUrl || '',
    source,
    raw_metadata: {
      authority: 'external',
      provenance: product.provenance,
      attempts: result.attempts.map((attempt) => ({
        provider: attempt.provider,
        outcome: attempt.outcome,
        durationMs: attempt.durationMs,
        status: attempt.status,
        error: attempt.error,
      })),
      description: product.description,
      imageUrls: product.imageUrls,
      model: product.model,
      color: product.color,
      size: product.size,
      weight: product.weight,
      country: product.country,
      packageDescription: product.packageDescription,
      packageQuantity: product.packageQuantity,
      ncm: product.ncm,
      cest: product.cest,
      metadata: product.metadata,
    },
    system_tag: 'inventory',
    checked_at: timestamp,
    manufacturer: product.manufacturer || null,
    category_general: product.categoryGeneral,
    category_raw: product.categoryRaw || null,
    confidence_score: product.confidence,
    cache_status: 'hit',
    miss_expires_at: null,
    canonical_updated_at: timestamp,
  }
}

export function negativeCacheRow(barcode: string, checkedAt = new Date(), ttlMs = 6 * 60 * 60 * 1000): CatalogCacheRow {
  return {
    barcode,
    name: '',
    brand: '',
    image_url: '',
    source: 'BALCAO',
    raw_metadata: { authority: 'external', negative: true },
    system_tag: 'inventory',
    checked_at: checkedAt.toISOString(),
    manufacturer: null,
    category_general: null,
    category_raw: null,
    confidence_score: null,
    cache_status: 'miss',
    miss_expires_at: new Date(checkedAt.getTime() + Math.max(1, ttlMs)).toISOString(),
    canonical_updated_at: null,
  }
}

export function preserveManualCacheIdentity(existing: CatalogCacheRow | null | undefined, incoming: CatalogCacheRow): CatalogCacheRow {
  const metadata = existing?.raw_metadata && typeof existing.raw_metadata === 'object' ? existing.raw_metadata : {}
  if (!existing || metadata.authority !== 'manual') return incoming

  return {
    ...incoming,
    name: cleanText(existing.name) || incoming.name,
    brand: cleanText(existing.brand) || incoming.brand,
    image_url: cleanText(existing.image_url) || incoming.image_url,
    source: cleanText(existing.source) || incoming.source,
    manufacturer: cleanText(existing.manufacturer) || incoming.manufacturer,
    category_general: (cleanText(existing.category_general) as GeneralCategory) || incoming.category_general,
    category_raw: cleanText(existing.category_raw) || incoming.category_raw,
    raw_metadata: {
      ...incoming.raw_metadata,
      ...metadata,
      authority: 'manual',
      external_enrichment: incoming.raw_metadata,
    },
    canonical_updated_at: existing.canonical_updated_at || incoming.canonical_updated_at,
  }
}
