import assert from 'node:assert/strict'
import test from 'node:test'
import { calculatePurchaseUpdate } from '../lib/inventory/intake.ts'

test('sets purchase cost when stock was empty', () => {
  assert.deepEqual(calculatePurchaseUpdate(0, 0, 12000, 642), {
    stockMilli: 12000,
    averageCostCents: 642,
  })
})

test('updates weighted average purchase cost using stock quantities', () => {
  assert.deepEqual(calculatePurchaseUpdate(10000, 500, 10000, 700), {
    stockMilli: 20000,
    averageCostCents: 600,
  })
})

test('ignores stale average cost when current stock is zero', () => {
  assert.deepEqual(calculatePurchaseUpdate(0, 999, 5000, 400), {
    stockMilli: 5000,
    averageCostCents: 400,
  })
})

test('rejects invalid quantities and negative costs', () => {
  assert.throws(() => calculatePurchaseUpdate(1000, 500, 0, 600), /quantidade/i)
  assert.throws(() => calculatePurchaseUpdate(1000, 500, 1000, -1), /custo/i)
})
