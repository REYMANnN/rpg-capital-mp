import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
function source(path: string) {
  const full = join(root, path)
  assert.equal(existsSync(full), true, `${path} is missing`)
  return readFileSync(full, 'utf8')
}

test('finance dashboard endpoint is protected by operational financial permission', () => {
  const route = source('app/api/balcao/finance/dashboard/route.ts')
  assert.match(route, /authorizeInventoryContext/)
  assert.match(route, /analysis\.financial/)
  assert.match(route, /balcao_finance_accounts/)
  assert.match(route, /balcao_finance_transactions/)
  assert.match(route, /balcao_finance_daily_metrics/)
  assert.match(route, /buildFinanceDashboard/)
})

test('finance dashboard offers 7, 30 and 90 day periods and identifies demo data', () => {
  const dashboard = source('app/inventory-v1/FinanceDashboard.tsx')
  assert.match(dashboard, /\[7, 30, 90\]/)
  assert.match(dashboard, /Dados de demonstração/)
  assert.match(dashboard, /Margem bruta/)
  assert.match(dashboard, /Fluxo de caixa/)
  assert.match(dashboard, /Movimentações/)
})

test('operational app has a real Financeiro tab and a finance-only path does not mount inventory state', () => {
  const inventory = source('app/inventory-v1/InventoryV1.tsx')
  const page = source('app/inventory-v1/page.tsx')
  assert.match(inventory, /FinanceDashboard/)
  assert.match(inventory, /'finance'/)
  assert.match(inventory, />Financeiro</)
  assert.match(page, /FinanceOnlyShell/)
  assert.match(page, /analysis\.financial/)
  assert.match(page, /inventory\.view/)
})

test('google management keeps settings while staff manager remains operational only', () => {
  const page = source('app/inventory-v1/page.tsx')
  assert.match(page, /managementAccess/)
  assert.match(page, /InventoryRoleGate[\s\S]*managementAccess/)
})
