import assert from 'node:assert/strict'
import test from 'node:test'
import { requiredPermissionsForStateChange } from '../../lib/accounts/statePolicy'

const base = { products: [{ id: 'p1', stock: 2 }], sales: [], movements: [], scaleRule: { prefix: '2' } }

test('inventory-only change requires inventory.write', () => {
  const next = { ...base, products: [{ id: 'p1', stock: 3 }] }
  assert.deepEqual(requiredPermissionsForStateChange(base, next), ['inventory.write'])
})

test('sale plus stock movement is classified as checkout', () => {
  const next = {
    ...base,
    products: [{ id: 'p1', stock: 1 }],
    sales: [{ id: 's1' }],
    movements: [{ id: 'm1', type: 'sale' }],
  }
  assert.deepEqual(requiredPermissionsForStateChange(base, next), ['checkout.sell'])
})

test('settings change requires settings.manage', () => {
  const next = { ...base, scaleRule: { prefix: '9' } }
  assert.deepEqual(requiredPermissionsForStateChange(base, next), ['settings.manage'])
})
