import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), 'utf8')

test('team and management UI expose TI and the v12 automation center', () => {
  const team = source('components/accounts/TeamManager.tsx')
  const manage = source('components/accounts/ManageShell.tsx')
  const roleGate = source('components/accounts/InventoryRoleGate.tsx')
  const automations = source('app/inventory-v1/AutomationsHub.tsx')
  const recipes = source('lib/platform/automation/recipes.ts')
  assert.match(team, /<option value="it">TI<\/option>/)
  assert.match(team, /Automações/)
  assert.match(manage, /'Automações'/)
  assert.match(roleGate, /automations\.view/)
  assert.match(automations, /Visão geral/)
  assert.match(automations, /Minhas automações/)
  assert.match(automations, /Integrações e API/)
  assert.match(recipes, /Preço inteligente/)
  assert.match(recipes, /Proteção de margem/)
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

test('front version is bumped for the v12 automation center release', () => {
  assert.match(source('lib/inventory/version.ts'), /v12\.0/)
})
