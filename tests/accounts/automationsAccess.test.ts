import test from 'node:test'
import assert from 'node:assert/strict'
import { permissionsForRole, permissionsForModules } from '../../lib/accounts/access.ts'

test('IT only receives automations and integration permissions', () => {
  const permissions = permissionsForRole('it')
  assert.equal(permissions.has('automations.view'), true)
  assert.equal(permissions.has('automations.manage'), true)
  assert.equal(permissions.has('integrations.view'), true)
  assert.equal(permissions.has('integrations.manage'), true)
  assert.equal(permissions.has('api_keys.manage'), true)
  assert.equal(permissions.has('webhooks.manage'), true)
  assert.equal(permissions.has('inventory.write'), false)
  assert.equal(permissions.has('checkout.sell'), false)
  assert.equal(permissions.has('analysis.financial'), false)
})

test('manager receives every store-level operational and management permission', () => {
  const permissions = permissionsForRole('manager')
  for (const permission of [
    'inventory.view', 'inventory.write', 'products.lookup', 'products.manage',
    'checkout.sell', 'sales.view', 'analysis.financial',
    'automations.view', 'automations.manage', 'integrations.view', 'integrations.manage',
    'api_keys.manage', 'webhooks.manage', 'team.manage', 'devices.manage',
    'stores.manage', 'settings.manage',
  ] as const) assert.equal(permissions.has(permission), true, permission)
})

test('custom automations module maps to automation permissions', () => {
  const permissions = permissionsForModules(['automations'])
  assert.equal(permissions.has('automations.view'), true)
  assert.equal(permissions.has('api_keys.manage'), true)
  assert.equal(permissions.has('inventory.write'), false)
})
