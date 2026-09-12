import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { permissionsForRole } from '../../lib/accounts/access'
import { parseStaffCreate } from '../../lib/accounts/payloads'

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), 'utf8')

test('finance role grants only the financial module', () => {
  const permissions = permissionsForRole('finance')
  assert.equal(permissions.has('analysis.financial'), true)
  assert.equal(permissions.has('inventory.view'), false)
  assert.equal(permissions.has('checkout.sell'), false)
  assert.equal(permissions.has('automations.view'), false)
})

test('staff manager gets all store modules and store management', () => {
  const permissions = permissionsForRole('manager')
  for (const permission of ['inventory.write','checkout.sell','analysis.financial','automations.view','team.manage','devices.manage','stores.manage','integrations.manage','settings.manage'] as const) assert.equal(permissions.has(permission), true, permission)
})

test('custom staff payload accepts operational module permissions including automations', () => {
  const valid = parseStaffCreate({ storeId: '783d602e-8309-4862-9d12-afac216a61f9', displayName: 'Contador', role: 'custom', pin: '1234', customPermissions: ['inventory.view','inventory.write','analysis.financial','automations.view'] })
  assert.equal(valid.success, true)
  const invalid = parseStaffCreate({ storeId: '783d602e-8309-4862-9d12-afac216a61f9', displayName: 'Intruso', role: 'custom', pin: '1234', customPermissions: ['team.manage','settings.manage'] })
  assert.equal(invalid.success, false)
})

test('team UI offers Financeiro, TI, Personalizado and Automações', () => {
  const team = source('components/accounts/TeamManager.tsx')
  assert.match(team, /value="finance">Financeiro/)
  assert.match(team, /value="it">TI/)
  assert.match(team, /value="custom">Personalizado/)
  assert.match(team, />Estoque</); assert.match(team, />Caixa</); assert.match(team, />Financeiro</); assert.match(team, /Automações/)
  assert.doesNotMatch(team, />Equipe</); assert.doesNotMatch(team, />Configurações</)
})

test('staff login names the finance and IT roles', () => {
  const login = source('components/accounts/StaffLogin.tsx')
  assert.match(login, /finance: 'Financeiro'/)
  assert.match(login, /it: 'TI'/)
})
