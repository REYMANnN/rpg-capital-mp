import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { BatchLimitError, resolveCatalogBatch } from '../lib/inventory/catalog/batch'
import type { CatalogCacheRow } from '../lib/inventory/catalog/cache'
import type { CatalogResolveResult } from '../lib/inventory/catalog/types'

const A = '7891000376843'
const B = '7894900011517'
const C = '7896004000855'
const D = '7891234567895'
const E = '7901234567893'

function hit(barcode: string, name: string): CatalogResolveResult {
  return {
    found: true,
    barcode,
    product: {
      barcode,
      name,
      brand: '', manufacturer: '', categoryRaw: '', categoryGeneral: 'Não classificado', description: '',
      imageUrl: '', imageUrls: [], model: '', color: '', size: '', weight: '', country: '', packageDescription: '',
      ncm: '', cest: '', confidence: 0.8, provenance: { name: 'ProductGuru' }, metadata: {},
    },
    attempts: [{ provider: 'ProductGuru', outcome: 'hit', durationMs: 1 }],
  }
}

function cachedHit(barcode: string, name: string): CatalogCacheRow {
  return {
    barcode, name, brand: '', image_url: '', source: 'BALCAO', raw_metadata: {}, checked_at: '2026-08-29T12:00:00.000Z', cache_status: 'hit',
  }
}

test('batch deduplicates external work but reconstructs the original order including duplicates and invalid codes', async () => {
  const resolveCalls: string[] = []
  const cacheReads: string[][] = []
  const writes: CatalogCacheRow[][] = []
  const result = await resolveCatalogBatch([A, B, A, 'bad-code', C], {
    readCache: async (barcodes) => {
      cacheReads.push(barcodes)
      return [cachedHit(A, 'Produto A')]
    },
    resolve: async (barcode) => {
      resolveCalls.push(barcode)
      if (barcode === B) return hit(B, 'Produto B')
      return { found: false, barcode, attempts: [] }
    },
    writeCache: async (rows) => { writes.push(rows) },
    now: () => new Date('2026-08-29T12:00:00.000Z'),
    concurrency: 2,
  })

  assert.deepEqual(cacheReads, [[A, B, C]])
  assert.deepEqual(resolveCalls.sort(), [B, C].sort())
  assert.deepEqual(result.results.map((item) => item.barcode), [A, B, A, 'bad-code', C])
  assert.equal(result.results[0].cached, true)
  assert.equal(result.results[1].found, true)
  assert.equal(result.results[2].cached, true)
  assert.equal(result.results[3].error, 'invalid_barcode')
  assert.equal(result.results[4].found, false)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].length, 2)
})

test('fresh negative cache skips resolver work', async () => {
  let calls = 0
  const result = await resolveCatalogBatch([C], {
    readCache: async () => [{
      ...cachedHit(C, ''), cache_status: 'miss', miss_expires_at: '2026-08-29T18:00:00.000Z',
    }],
    resolve: async () => { calls += 1; return hit(C, 'Nunca deve executar') },
    writeCache: async () => {},
    now: () => new Date('2026-08-29T12:00:00.000Z'),
  })
  assert.equal(calls, 0)
  assert.equal(result.results[0].found, false)
  assert.equal(result.results[0].cached, true)
})

test('batch caps unique valid EANs at 100', async () => {
  const codes = Array.from({ length: 101 }, (_, index) => String(10000000 + index))
  await assert.rejects(
    () => resolveCatalogBatch(codes, { readCache: async () => [], resolve: async (barcode) => ({ found: false, barcode, attempts: [] }), writeCache: async () => {} }),
    BatchLimitError,
  )
})

test('one resolver failure does not fail the rest of the batch', async () => {
  const result = await resolveCatalogBatch([D, E], {
    readCache: async () => [],
    resolve: async (barcode) => {
      if (barcode === D) throw new Error('provider explosion')
      return hit(E, 'Produto E')
    },
    writeCache: async () => {},
  })
  assert.equal(result.results[0].found, false)
  assert.equal(result.results[0].error, 'lookup_failed')
  assert.equal(result.results[1].found, true)
  assert.equal(result.results[1].product?.name, 'Produto E')
})

test('product resolution concurrency stays bounded', async () => {
  let active = 0
  let maxActive = 0
  const codes = [A, B, C, D, E, '7891111111118']
  await resolveCatalogBatch(codes, {
    readCache: async () => [],
    resolve: async (barcode) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 15))
      active -= 1
      return hit(barcode, `Produto ${barcode}`)
    },
    writeCache: async () => {},
    concurrency: 2,
  })
  assert.ok(maxActive <= 2)
  assert.ok(maxActive > 1)
})

test('batch API route validates the body and uses one cache query plus grouped upsert', () => {
  const source = readFileSync(new URL('../app/api/products/lookup/batch/route.ts', import.meta.url), 'utf8')
  assert.match(source, /Array\.isArray/)
  assert.match(source, /resolveCatalogBatch/)
  assert.match(source, /\.in\('barcode'/)
  assert.match(source, /\.upsert\(rows\)/)
  assert.match(source, /BatchLimitError/)
})
