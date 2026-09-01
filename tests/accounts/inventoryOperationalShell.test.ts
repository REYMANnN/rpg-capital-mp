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

test('inventory navigation is controlled by permissions instead of CSS nth-child hiding', () => {
  const gate = source('components/accounts/InventoryRoleGate.tsx')
  assert.match(gate, /canStock/)
  assert.match(gate, /canIntake/)
  assert.match(gate, /canCheckout/)
  assert.match(gate, /canSettings/)
  assert.match(gate, /permissionsForRole/)
  assert.doesNotMatch(gate, /nth-child/)
})

test('the original inventory header exposes staff profile and logout', () => {
  const gate = source('components/accounts/InventoryRoleGate.tsx')
  assert.match(gate, /Perfil do usuário/)
  assert.match(gate, /Trocar funcionário/)
  assert.match(gate, /\/api\/balcao\/staff\/logout/)
  assert.match(gate, /createPortal/)
})

test('inventory is always wrapped so staff role resolution also works when account enforcement flag is off', () => {
  const page = source('app/inventory-v1/page.tsx')
  assert.match(page, /BALCAO_ACCOUNTS_ENFORCED/)
  assert.match(page, /return <InventoryRoleGate role="manager"><InventoryV1 \/><\/InventoryRoleGate>/)
})
