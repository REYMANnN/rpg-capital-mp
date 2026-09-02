import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { permissionsForRole } from '../../lib/accounts/access'
import { parseStaffCreate } from '../../lib/accounts/payloads'

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), 'utf8')

test('finance role grants only the financial module', () => {
  const permissions = permissionsForRole('finance' as any)
  assert.equal(permissions.has('analysis.financial'), true)
  assert.equal(permissions.has('inventory.view'), false)
  assert.equal(permissions.has('checkout.sell'), false)
  assert.equal(permissions.has('team.manage'), false)
  assert.equal(permissions.has('settings.manage'), false)
})

test('staff manager gets the three operational modules but not account administration', () => {
  const permissions = permissionsForRole('manager')
  assert.equal(permissions.has('inventory.write'), true)
  assert.equal(permissions.has('checkout.sell'), true)
  assert.equal(permissions.has('analysis.financial'), true)
  assert.equal(permissions.has('team.manage'), false)
  assert.equal(permissions.has('devices.manage'), false)
  assert.equal(permissions.has('stores.manage'), false)
  assert.equal(permissions.has('integrations.manage'), false)
  assert.equal(permissions.has('settings.manage'), false)
})

test('custom staff payload accepts only operational module permissions', () => {
  const valid = parseStaffCreate({
    storeId: '783d602e-8309-4862-9d12-afac216a61f9',
    displayName: 'Contador',
    role: 'custom',
    pin: '1234',
    customPermissions: ['inventory.view', 'inventory.write', 'analysis.financial'],
  })
  assert.equal(valid.success, true)

  const invalid = parseStaffCreate({
    storeId: '783d602e-8309-4862-9d12-afac216a61f9',
    displayName: 'Intruso',
    role: 'custom',
    pin: '1234',
    customPermissions: ['team.manage', 'settings.manage'],
  })
  assert.equal(invalid.success, false)
})

test('team UI offers Financeiro and Personalizado based on the three operational modules', () => {
  const team = source('components/accounts/TeamManager.tsx')
  assert.match(team, /value="finance">Financeiro/)
  assert.match(team, /value="custom">Personalizado/)
  assert.match(team, />Estoque</)
  assert.match(team, />Caixa</)
  assert.match(team, />Financeiro</)
  assert.doesNotMatch(team, />Equipe</)
  assert.doesNotMatch(team, />Configurações</)
})

test('staff login names the finance role', () => {
  const login = source('components/accounts/StaffLogin.tsx')
  assert.match(login, /finance: 'Financeiro'/)
})
