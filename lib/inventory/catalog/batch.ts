import {
  cacheRowToLookupResponse,
  isFreshNegativeCache,
  isUsableCacheHit,
  negativeCacheRow,
  preserveManualCacheIdentity,
  resolutionToCacheRow,
  type CatalogCacheRow,
} from './cache'
import { normalizeBarcode } from './normalize'
import type { CatalogResolveResult } from './types'

export class BatchLimitError extends Error {
  constructor(message = 'batch_limit_exceeded') {
    super(message)
    this.name = 'BatchLimitError'
  }
}

type BatchLookupItem = {
  barcode: string
  found: boolean
  cached?: boolean
  source?: string
  product?: Record<string, unknown>
  error?: 'invalid_barcode' | 'lookup_failed'
}

type BatchDependencies = {
  readCache: (barcodes: string[]) => Promise<CatalogCacheRow[]>
  resolve: (barcode: string) => Promise<CatalogResolveResult>
  writeCache: (rows: CatalogCacheRow[]) => Promise<void>
  now?: () => Date
  concurrency?: number
}

type BatchResult = {
  results: BatchLookupItem[]
  uniqueValidCount: number
}

function resolvedResponse(result: CatalogResolveResult): BatchLookupItem {
  if (!result.found || !result.product) {
    return { barcode: result.barcode, found: false, cached: false }
  }
  const source = result.product.provenance.name
    || result.attempts.find((attempt) => attempt.outcome === 'hit')?.provider
    || 'BALCAO'
  return {
    barcode: result.barcode,
    found: true,
    cached: false,
    source,
    product: result.product as unknown as Record<string, unknown>,
  }
}

async function mapWithConcurrency<T>(
  values: string[],
  concurrency: number,
  worker: (value: string) => Promise<T>,
): Promise<T[]> {
  const results = new Array<T>(values.length)
  let next = 0

  async function run() {
    while (true) {
      const index = next
      next += 1
      if (index >= values.length) return
      results[index] = await worker(values[index])
    }
  }

  const workerCount = Math.min(Math.max(1, Math.trunc(concurrency)), Math.max(1, values.length))
  await Promise.all(Array.from({ length: workerCount }, () => run()))
  return results
}

export async function resolveCatalogBatch(
  rawBarcodes: string[],
  dependencies: BatchDependencies,
): Promise<BatchResult> {
  const normalizedByIndex = rawBarcodes.map((raw) => normalizeBarcode(raw))
  const uniqueValid = [...new Set(normalizedByIndex.filter((barcode): barcode is string => Boolean(barcode)))]

  if (uniqueValid.length > 100) throw new BatchLimitError()

  const now = dependencies.now?.() ?? new Date()
  const cacheRows = uniqueValid.length ? await dependencies.readCache(uniqueValid) : []
  const cacheByBarcode = new Map(cacheRows.map((row) => [row.barcode, row]))
  const responseByBarcode = new Map<string, BatchLookupItem>()
  const unresolved: string[] = []

  for (const barcode of uniqueValid) {
    const cached = cacheByBarcode.get(barcode)
    if (cached && isUsableCacheHit(cached)) {
      const cachedResponse = cacheRowToLookupResponse(cached)
      responseByBarcode.set(barcode, { barcode, ...cachedResponse } as BatchLookupItem)
      continue
    }
    if (isFreshNegativeCache(cached, now.getTime())) {
      responseByBarcode.set(barcode, { barcode, found: false, cached: true })
      continue
    }
    unresolved.push(barcode)
  }

  const writes: CatalogCacheRow[] = []
  const resolvedItems = await mapWithConcurrency(
    unresolved,
    dependencies.concurrency ?? 4,
    async (barcode) => {
      try {
        const result = await dependencies.resolve(barcode)
        if (result.found && result.product) {
          const incoming = resolutionToCacheRow(result, now)
          writes.push(preserveManualCacheIdentity(cacheByBarcode.get(barcode), incoming))
          return resolvedResponse(result)
        }
        writes.push(negativeCacheRow(barcode, now))
        return { barcode, found: false, cached: false } satisfies BatchLookupItem
      } catch {
        return { barcode, found: false, cached: false, error: 'lookup_failed' } satisfies BatchLookupItem
      }
    },
  )

  resolvedItems.forEach((item, index) => responseByBarcode.set(unresolved[index], item))
  if (writes.length) await dependencies.writeCache(writes)

  const results = rawBarcodes.map((raw, index): BatchLookupItem => {
    const normalized = normalizedByIndex[index]
    if (!normalized) return { barcode: raw, found: false, error: 'invalid_barcode' }
    return responseByBarcode.get(normalized) ?? { barcode: normalized, found: false }
  })

  return { results, uniqueValidCount: uniqueValid.length }
}
