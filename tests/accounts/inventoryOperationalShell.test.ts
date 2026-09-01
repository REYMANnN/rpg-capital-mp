import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function source(path: string) {
  return readFileSync(join(root, path), 'utf8')
}

test('staff access login opens the original BALCÃO inventory directly', () => {
  const login = source('components/accounts/StaffAccessLogin.tsx')
  assert.match(login, /router\.replace\(['"]\/inventory-v1['"]\)/)
  assert.doesNotMatch(login, /router\.replace\(['"]\/work['"]\)/)
})

test('inventory role gate resolves the current operational staff session', () => {
  const gate = source('components/accounts/InventoryRoleGate.tsx')
  assert.match(gate, /\/api\/balcao\/work\/context/)
  assert.match(gate, /currentStaff/)
  assert.match(gate, /store.*displayName/s)
})

test('inventory navigation is rendered from permissions instead of CSS nth-child hiding', () => {
  const inventory = source('app/inventory-v1/InventoryV1.tsx')
  const gate = source('components/accounts/InventoryRoleGate.tsx')
  assert.match(inventory, /canStock/)
  assert.match(inventory, /canIntake/)
  assert.match(inventory, /canCheckout/)
  assert.match(inventory, /canSettings/)
  assert.doesNotMatch(gate, /nth-child/)
})

test('the original inventory header exposes staff profile and logout', () => {
  const inventory = source('app/inventory-v1/InventoryV1.tsx')
  assert.match(inventory, /Perfil do usuário/)
  assert.match(inventory, /Trocar funcionário/)
  assert.match(inventory, /\/api\/balcao\/staff\/logout/)
})
