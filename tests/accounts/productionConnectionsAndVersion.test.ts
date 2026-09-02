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

test('bank connections listing does not require the Supabase service-role key', () => {
  const route = source('app/api/balcao/finance/connections/route.ts')
  const migration = source('supabase/migrations/20260902_balcao_finance_connections_without_service_role.sql')

  assert.doesNotMatch(route, /createAdminClient/)
  assert.match(route, /balcao_list_finance_connections/)
  assert.match(migration, /create or replace function public\.balcao_list_finance_connections/)
  assert.match(migration, /balcao_operational_context/)
  assert.match(migration, /grant execute[\s\S]*authenticated/)
})

test('management can remove a bank connection without the service-role key', () => {
  const route = source('app/api/balcao/finance/connections/[id]/route.ts')
  const migration = source('supabase/migrations/20260902_balcao_finance_connections_without_service_role.sql')

  assert.doesNotMatch(route, /createAdminClient/)
  assert.match(route, /balcao_get_finance_connection_for_management/)
  assert.match(route, /balcao_disconnect_finance_connection/)
  assert.match(migration, /create or replace function public\.balcao_disconnect_finance_connection/)
})

test('Malvo success can persist a real connection using the authenticated management session', () => {
  const ui = source('app/inventory-v1/finance/BankConnections.tsx')
  const route = source('app/api/balcao/finance/malvo/complete/route.ts')
  const sync = source('lib/malvo/managementSync.ts')
  const migration = source('supabase/migrations/20260902_balcao_finance_connections_without_service_role.sql')

  assert.match(ui, /\/api\/balcao\/finance\/malvo\/complete/)
  assert.match(ui, /data\.item/)
  assert.match(route, /syncMalvoItemAsManagement/)
  assert.doesNotMatch(sync, /createAdminClient/)
  assert.match(sync, /balcao_apply_malvo_snapshot/)
  assert.match(migration, /create or replace function public\.balcao_apply_malvo_snapshot/)
})

test('every page inherits a visible Balcao software version and deployment commit', () => {
  const layout = source('app/layout.tsx')
  const pkg = source('package.json')

  assert.match(pkg, /"version":\s*"0\.2\.0"/)
  assert.match(layout, /BALCÃO/)
  assert.match(layout, /VERCEL_GIT_COMMIT_SHA/)
  assert.match(layout, /data-build-version/)
})
