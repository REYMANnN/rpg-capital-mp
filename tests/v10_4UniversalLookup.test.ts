import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  cacheRowToLookupResponse,
  isFreshNegativeCache,
  negativeCacheRow,
  resolutionToCacheRow,
} from '../lib/inventory/catalog/cache'
import type { CatalogResolveResult } from '../lib/inventory/catalog/types'

const EAN = '7891000376843'
const routeSource = readFileSync(new URL('../app/api/products/lookup/route.ts', import.meta.url), 'utf8')

test('cached hit keeps the legacy lookup response while exposing optional enrichment', () => {
  const response = cacheRowToLookupResponse({
    barcode: EAN,
    name: 'Bono Chocolate 90g',
    brand: 'Nestlé',
    image_url: 'https://img.example/bono.jpg',
    source: 'ProductGuru',
    raw_metadata: {},
    checked_at: '2026-08-29T12:00:00.000Z',
    manufacturer: 'Nestlé Brasil',
    category_general: 'Alimentos e bebidas',
    category_raw: 'Food > Biscuits',
    confidence_score: 0.92,
    cache_status: 'hit',
    miss_expires_at: null,
    canonical_updated_at: '2026-08-29T12:00:00.000Z',
  })

  assert.equal(response.found, true)
  assert.equal(response.cached, true)
  assert.equal(response.source, 'ProductGuru')
  assert.deepEqual(response.product, {
    barcode: EAN,
    name: 'Bono Chocolate 90g',
    brand: 'Nestlé',
    imageUrl: 'https://img.example/bono.jpg',
    manufacturer: 'Nestlé Brasil',
    categoryGeneral: 'Alimentos e bebidas',
    categoryRaw: 'Food > Biscuits',
    confidence: 0.92,
  })
})

test('negative cache expires and never pretends to be a product hit', () => {
  const checkedAt = new Date('2026-08-29T12:00:00.000Z')
  const row = negativeCacheRow(EAN, checkedAt, 6 * 60 * 60 * 1000)
  assert.equal(row.cache_status, 'miss')
  assert.equal(row.name, '')
  assert.equal(isFreshNegativeCache(row, checkedAt.getTime() + 5 * 60 * 60 * 1000), true)
  assert.equal(isFreshNegativeCache(row, checkedAt.getTime() + 7 * 60 * 60 * 1000), false)
})

test('resolved product persists enrichment, provenance and provider attempts', () => {
  const result: CatalogResolveResult = {
    found: true,
    barcode: EAN,
    product: {
      barcode: EAN,
      name: 'Samsung Galaxy A55',
      brand: 'Samsung',
      manufacturer: 'Samsung Electronics',
      categoryRaw: 'Electronics > Smartphones',
      categoryGeneral: 'Eletrônicos',
      description: 'Smartphone 5G',
      imageUrl: 'https://img.example/a55.jpg',
      imageUrls: ['https://img.example/a55.jpg'],
      model: 'SM-A556',
      color: 'Navy',
      size: '128GB',
      weight: '213 g',
      country: '',
      packageDescription: '',
      ncm: '',
      cest: '',
      confidence: 0.97,
      provenance: { name: 'ProductGuru', imageUrl: 'UPCitemdb' },
      metadata: { providers: ['ProductGuru', 'UPCitemdb'] },
    },
    attempts: [
      { provider: 'ProductGuru', outcome: 'hit', durationMs: 12 },
      { provider: 'UPCitemdb', outcome: 'hit', durationMs: 22 },
    ],
  }

  const row = resolutionToCacheRow(result, new Date('2026-08-29T12:00:00.000Z'))
  assert.equal(row.name, 'Samsung Galaxy A55')
  assert.equal(row.manufacturer, 'Samsung Electronics')
  assert.equal(row.category_general, 'Eletrônicos')
  assert.equal(row.cache_status, 'hit')
  assert.equal(row.source, 'ProductGuru')
  assert.equal((row.raw_metadata as any).provenance.imageUrl, 'UPCitemdb')
  assert.equal((row.raw_metadata as any).attempts.length, 2)
})

test('single lookup route is cache-first and delegates misses to the universal resolver', () => {
  assert.match(routeSource, /resolveUniversalProduct/)
  assert.match(routeSource, /cache_status/)
  assert.match(routeSource, /miss_expires_at/)
  assert.match(routeSource, /manufacturer/)
  assert.match(routeSource, /category_general/)
  assert.match(routeSource, /confidence_score/)
  assert.match(routeSource, /negativeCacheRow/)
})
