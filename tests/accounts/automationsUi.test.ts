import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), 'utf8')

test('team and management UI expose TI and Automacoes', () => {
  const team = source('components/accounts/TeamManager.tsx')
  const manage = source('components/accounts/ManageShell.tsx')
  const roleGate = source('components/accounts/InventoryRoleGate.tsx')
  const automations = source('app/inventory-v1/AutomationsHub.tsx')
  assert.match(team, /<option value="it">TI<\/option>/)
  assert.match(team, /Automações/)
  assert.match(manage, /'Automações'/)
  assert.match(roleGate, /automations\.view/)
  assert.match(automations, /Preço Inteligente/)
  assert.match(automations, /Conectar outro sistema/)
  assert.match(automations, /Usar meus dados fora do Balcão/)
  assert.match(automations, /Integração avançada/)
})

test('operational app exposes Automacoes as a first-class main navigation button', () => {
  const roleGate = source('components/accounts/InventoryRoleGate.tsx')
  assert.match(roleGate, /navTarget/)
  assert.match(roleGate, /window\.location\.assign\('\/automations'\)/)
  assert.match(roleGate, /<Bot[^>]*\/>Automações<\/button>/)
})

test('automations page can resolve the current store without a Vercel service-role secret in unenforced mode', () => {
  const page = source('app/automations/page.tsx')
  assert.match(page, /BALCAO_ACCOUNTS_ENFORCED/)
  assert.match(page, /createInventoryCloudClient/)
  assert.match(page, /balcao_automation_store_context/)
})

test('front version is bumped for automations release', () => {
  assert.match(source('lib/inventory/version.ts'), /v11\.0/)
})
