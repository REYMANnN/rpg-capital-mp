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

test('finance dashboard endpoint uses a permission-aware Supabase RPC without service role', () => {
  const route = source('app/api/balcao/finance/dashboard/route.ts')
  assert.match(route, /createServerClient/)
  assert.match(route, /balcao_finance_dashboard_source/)
  assert.match(route, /buildFinanceDashboard/)
  assert.doesNotMatch(route, /createAdminClient/)
  assert.doesNotMatch(route, /authorizeInventoryContext/)
})

test('finance dashboard source RPC supports Google management and PIN staff finance permission', () => {
  const migration = source('supabase/migrations/20260902_balcao_finance_dashboard_rpc.sql')
  assert.match(migration, /balcao_finance_dashboard_source/)
  assert.match(migration, /auth\.uid\(\)/)
  assert.match(migration, /analysis\.financial/)
  assert.match(migration, /balcao_operational_context/)
  assert.match(migration, /inventory_v1_get_state/)
  assert.match(migration, /balcao_finance_accounts/)
  assert.match(migration, /balcao_finance_transactions/)
  assert.match(migration, /balcao_finance_daily_metrics/)
})

test('finance v2 RPC returns enough lookback for previous-period comparisons', () => {
  const migration = source('supabase/migrations/20260902_balcao_finance_dashboard_v2_lookback.sql')
  assert.match(migration, /v_lookback_days/)
  assert.match(migration, /v_days \* 2/)
  assert.match(migration, /limit 10000/i)
  assert.match(migration, /balcao_finance_dashboard_source/)
})

test('finance v2 keeps the visual business views and technical depth after demo data is retired', () => {
  const dashboard = source('app/inventory-v1/FinanceDashboard.tsx')
  assert.match(dashboard, /\[7, 30, 90\]/)
  assert.match(dashboard, /Visão geral/)
  assert.match(dashboard, /Vendas/)
  assert.match(dashboard, /Gastos/)
  assert.match(dashboard, /Movimentações/)
  assert.match(dashboard, /Conexões/)
  assert.match(dashboard, /Exportar CSV/)
  assert.match(dashboard, /CMV/)
  assert.match(dashboard, /Margem bruta/)
  assert.doesNotMatch(dashboard, /Dados de demonstração/)
})

test('finance v2 speaks to a non-accountant before exposing accounting terminology', () => {
  const dashboard = source('app/inventory-v1/FinanceDashboard.tsx')
  assert.match(dashboard, /Dinheiro entrando e saindo/)
  assert.match(dashboard, /Quanto sobrou das vendas/)
  assert.match(dashboard, /O que merece sua atenção/)
  assert.match(dashboard, /Para onde foi seu dinheiro/)
})

test('finance charts use robust SVG visualizations instead of the old percentage-height sales bars', () => {
  const charts = source('app/inventory-v1/finance/FinanceCharts.tsx')
  assert.match(charts, /<svg/)
  assert.match(charts, /viewBox=/)
  assert.match(charts, /CashFlowChart/)
  assert.match(charts, /SalesAndCostChart/)
  assert.match(charts, /MarginTrendChart/)
  assert.match(charts, /ExpenseDonut/)

  const dashboard = source('app/inventory-v1/FinanceDashboard.tsx')
  assert.doesNotMatch(dashboard, /flex w-\[70%\] flex-col-reverse/)
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
