import assert from 'node:assert/strict'
import test from 'node:test'
import { createProviderBudget } from '../lib/inventory/catalog/budget'
import { resolveUniversalProduct } from '../lib/inventory/catalog/resolver'
import type { CatalogCandidate, CatalogLookup, CatalogProvider, ProviderAttempt } from '../lib/inventory/catalog/types'

const EAN = '7891000376843'

function attempt(provider: CatalogProvider, outcome: ProviderAttempt['outcome'], candidate?: Partial<CatalogCandidate>): ProviderAttempt {
  return {
    provider,
    outcome,
    durationMs: 1,
    candidate: candidate ? { barcode: EAN, provider, ...candidate } : undefined,
  }
}

function stub(value: ProviderAttempt, onCall?: () => void): CatalogLookup {
  return async () => {
    onCall?.()
    return value
  }
}

test('strong Wave A identity resolves product without spending Wave B', async () => {
  let waveBCalls = 0
  const result = await resolveUniversalProduct(EAN, {
    dependencies: {
      waveA: [stub(attempt('ProductGuru', 'hit', { name: 'Bono Chocolate 90g', brand: 'Nestlé' }))],
      waveB: [stub(attempt('UPCitemdb', 'hit', { name: 'Fallback product' }), () => waveBCalls++)],
    },
  })

  assert.equal(result.found, true)
  assert.equal(result.product?.name, 'Bono Chocolate 90g')
  assert.equal(waveBCalls, 0)
  assert.equal(result.attempts.length, 1)
})

test('Wave B runs when Wave A has enrichment but no usable identity', async () => {
  let waveBCalls = 0
  const result = await resolveUniversalProduct(EAN, {
    dependencies: {
      waveA: [stub(attempt('EanPictures', 'hit', { imageUrl: 'https://img.example/a.jpg', categoryRaw: 'Biscoitos' }))],
      waveB: [stub(attempt('BarcodeFinder', 'hit', { name: 'Bono Chocolate 90g', brand: 'Nestlé' }), () => waveBCalls++)],
    },
  })

  assert.equal(waveBCalls, 1)
  assert.equal(result.found, true)
  assert.equal(result.product?.name, 'Bono Chocolate 90g')
  assert.equal(result.product?.imageUrl, 'https://img.example/a.jpg')
})

test('provider failures are isolated and complementary hits still merge', async () => {
  const result = await resolveUniversalProduct(EAN, {
    dependencies: {
      waveA: [
        stub(attempt('OpenFacts', 'timeout')),
        stub(attempt('ProductGuru', 'hit', { name: 'Samsung Galaxy A55', brand: 'Samsung' })),
        stub(attempt('GTINSearch', 'hit', { imageUrl: 'https://img.example/a55.jpg', categoryRaw: 'Electronics' })),
        stub(attempt('Brocade', 'unavailable')),
      ],
      waveB: [],
    },
  })

  assert.equal(result.found, true)
  assert.equal(result.product?.name, 'Samsung Galaxy A55')
  assert.equal(result.product?.imageUrl, 'https://img.example/a55.jpg')
  assert.equal(result.product?.categoryGeneral, 'Eletrônicos')
  assert.deepEqual(result.attempts.map((item) => item.outcome), ['timeout', 'hit', 'hit', 'unavailable'])
})

test('total deadline returns best completed candidate and aborts slow providers', async () => {
  let slowAborted = false
  const slow: CatalogLookup = async (_barcode, signal) => await new Promise<ProviderAttempt>((resolve) => {
    const timer = setTimeout(() => resolve(attempt('Brocade', 'miss')), 500)
    signal?.addEventListener('abort', () => {
      slowAborted = true
      clearTimeout(timer)
      resolve(attempt('Brocade', 'timeout'))
    }, { once: true })
  })

  const started = Date.now()
  const result = await resolveUniversalProduct(EAN, {
    totalDeadlineMs: 30,
    dependencies: {
      waveA: [stub(attempt('ProductGuru', 'hit', { name: 'Produto rápido' })), slow],
      waveB: [],
    },
  })

  assert.equal(result.found, true)
  assert.equal(result.product?.name, 'Produto rápido')
  assert.equal(slowAborted, true)
  assert.ok(Date.now() - started < 250)
})

test('provider budget enforces concurrency, spacing and UTC daily limit', () => {
  let now = Date.UTC(2026, 7, 29, 12, 0, 0)
  const budget = createProviderBudget({ dailyLimit: 2, minSpacingMs: 10_000, maxConcurrent: 1, now: () => now })

  const first = budget.tryAcquire()
  assert.equal(first.allowed, true)
  assert.equal(budget.tryAcquire().reason, 'busy')
  first.release?.()
  assert.equal(budget.tryAcquire().reason, 'spacing')

  now += 10_000
  const second = budget.tryAcquire()
  assert.equal(second.allowed, true)
  second.release?.()

  now += 10_000
  assert.equal(budget.tryAcquire().reason, 'daily_limit')

  now = Date.UTC(2026, 7, 30, 0, 0, 1)
  const nextDay = budget.tryAcquire()
  assert.equal(nextDay.allowed, true)
  nextDay.release?.()
})
