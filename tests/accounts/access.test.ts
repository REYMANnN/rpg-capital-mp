import test from 'node:test'
import assert from 'node:assert/strict'
import { can, nextPinLock, permissionsForRole } from '../../lib/accounts/access'

test('stock can manage inventory but cannot checkout or view financial analysis', () => {
  const p = permissionsForRole('stock')
  assert.equal(can(p, 'inventory.view'), true)
  assert.equal(can(p, 'inventory.write'), true)
  assert.equal(can(p, 'checkout.sell'), false)
  assert.equal(can(p, 'analysis.financial'), false)
})

test('cashier can sell but cannot manually manage inventory', () => {
  const p = permissionsForRole('cashier')
  assert.equal(can(p, 'checkout.sell'), true)
  assert.equal(can(p, 'products.lookup'), true)
  assert.equal(can(p, 'inventory.write'), false)
  assert.equal(can(p, 'analysis.financial'), false)
})

test('finance can view financial analysis without stock or checkout access', () => {
  const p = permissionsForRole('finance')
  assert.equal(can(p, 'analysis.financial'), true)
  assert.equal(can(p, 'inventory.view'), false)
  assert.equal(can(p, 'checkout.sell'), false)
})

test('manager gets all operational modules but not account administration', () => {
  const p = permissionsForRole('manager')
  for (const permission of ['inventory.write', 'checkout.sell', 'analysis.financial'] as const) {
    assert.equal(can(p, permission), true)
  }
  for (const permission of ['team.manage', 'devices.manage', 'stores.manage', 'integrations.manage', 'settings.manage'] as const) {
    assert.equal(can(p, permission), false)
  }
})

test('custom role only receives explicitly granted operational permissions', () => {
  const p = permissionsForRole('custom', ['inventory.view', 'products.lookup', 'team.manage'])
  assert.equal(can(p, 'inventory.view'), true)
  assert.equal(can(p, 'products.lookup'), true)
  assert.equal(can(p, 'checkout.sell'), false)
  assert.equal(can(p, 'team.manage'), false)
})

test('pin lock starts after five failures and increases progressively', () => {
  assert.equal(nextPinLock(4, 1_000), null)
  assert.deepEqual(nextPinLock(5, 1_000), { lockedUntil: 31_000, level: 1 })
  assert.deepEqual(nextPinLock(10, 1_000), { lockedUntil: 121_000, level: 2 })
  assert.deepEqual(nextPinLock(15, 1_000), { lockedUntil: 301_000, level: 3 })
})
