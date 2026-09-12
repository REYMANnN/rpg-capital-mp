import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), 'utf8')

test('v12 exposes a complete merchant-first automation center', () => {
  const hub = source('app/inventory-v1/AutomationsHub.tsx')
  for (const label of ['Visão geral', 'Minhas automações', 'Descobrir', 'Sugestões', 'Histórico', 'Integrações e API']) {
    assert.match(hub, new RegExp(label))
  }
  assert.match(source('lib/inventory/version.ts'), /v12\.0/)
})

test('v12 has a deterministic automation recipe engine and catalogue', () => {
  assert.equal(existsSync(join(root, 'lib/platform/automation/recipes.ts')), true)
  assert.equal(existsSync(join(root, 'lib/platform/automation/engine.ts')), true)
  const recipes = source('lib/platform/automation/recipes.ts')
  for (const key of ['margin_protection','smart_pricing','low_stock','stockout_risk','stagnant_stock','excess_stock','replenishment','missing_cost','sales_drop','daily_summary']) {
    assert.match(recipes, new RegExp(key))
  }
  assert.doesNotMatch(recipes, /pix\.send|payment\.create|transfer\.create/)
})

test('v12 persists automation instances, runs and actions', () => {
  assert.equal(existsSync(join(root, 'supabase/migrations/20260912_balcao_automation_center_v12.sql')), true)
  const migration = source('supabase/migrations/20260912_balcao_automation_center_v12.sql')
  assert.match(migration, /create table if not exists public\.balcao_automations/)
  assert.match(migration, /create table if not exists public\.balcao_automation_runs/)
  assert.match(migration, /create table if not exists public\.balcao_automation_actions/)
  assert.match(migration, /balcao_automation_center_state/)
  assert.match(migration, /balcao_automation_upsert/)
  assert.match(migration, /balcao_automation_record_run/)
})

test('automation current-production path does not require Vercel service role', () => {
  const context = source('lib/platform/auth/automationsContext.ts')
  const adapter = source('lib/platform/inventoryAdapter.ts')
  assert.doesNotMatch(context, /createAdminClient/)
  assert.doesNotMatch(adapter, /createAdminClient/)
  assert.match(context, /INVENTORY_INSTALLATION_COOKIE/)
  assert.match(adapter, /createInventoryCloudClient/)
})

test('exports stay inside BALCAO and never navigate browser directly to API JSON', () => {
  const exportsPanel = source('app/inventory-v1/automations/ExportsPanel.tsx')
  assert.doesNotMatch(exportsPanel, /<a[^>]+href=\{`\/api\/balcao\/automations\/exports/)
  assert.match(exportsPanel, /response\.blob\(\)/)
  assert.match(exportsPanel, /URL\.createObjectURL/)
  assert.match(exportsPanel, /AutomationError/)
  assert.match(exportsPanel, /onRetry=/)
})

test('automation UX has shared human-readable failures with diagnostic codes', () => {
  assert.equal(existsSync(join(root, 'app/inventory-v1/automations/AutomationError.tsx')), true)
  assert.equal(existsSync(join(root, 'lib/platform/automation/client.ts')), true)
  const error = source('app/inventory-v1/automations/AutomationError.tsx')
  assert.match(error, /Código:/)
  assert.match(error, /Tentar novamente/)
})
