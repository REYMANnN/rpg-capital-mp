import assert from 'node:assert/strict'
import test from 'node:test'
import { DEMO_NFE_ACCESS_KEY, isValidNfeAccessKey, normalizeNfeAccessKey } from '../lib/inventory/nfeKey.ts'

test('normalizes spaces and punctuation from NF-e access key', () => {
  assert.equal(normalizeNfeAccessKey('3526 0812 3456 7800 0190 5500 1000 9000 0111 2345 6783'), DEMO_NFE_ACCESS_KEY)
})

test('accepts valid 44-digit NF-e key with modulo-11 check digit', () => {
  assert.equal(DEMO_NFE_ACCESS_KEY.length, 44)
  assert.equal(isValidNfeAccessKey(DEMO_NFE_ACCESS_KEY), true)
})

test('rejects wrong length, non-digits after normalization and wrong check digit', () => {
  assert.equal(isValidNfeAccessKey('123'), false)
  assert.equal(isValidNfeAccessKey(`${DEMO_NFE_ACCESS_KEY.slice(0, -1)}9`), false)
  assert.equal(isValidNfeAccessKey('not-a-key'), false)
})
