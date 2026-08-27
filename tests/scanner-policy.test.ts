import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateDetection } from '../lib/inventory/scannerPolicy.ts'

test('no detection is silent and keeps scanning', () => {
  assert.deepEqual(evaluateDetection(null), { kind: 'miss' })
})

test('invalid EAN-13 checksum is rejected', () => {
  assert.deepEqual(
    evaluateDetection({ rawValue: '7894900011518', format: 'ean_13' }),
    { kind: 'reject', code: '7894900011518' },
  )
})

test('valid EAN-13 is accepted immediately', () => {
  assert.deepEqual(
    evaluateDetection({ rawValue: '7894900011517', format: 'ean_13' }),
    { kind: 'accept', code: '7894900011517' },
  )
})
