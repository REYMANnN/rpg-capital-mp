import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const migrationDir = join(root, 'supabase/migrations')

function financeMigration() {
  const file = readdirSync(migrationDir).find((name) => name.includes('balcao_financeiro'))
  assert.ok(file, 'finance migration is missing')
  return readFileSync(join(migrationDir, file), 'utf8')
}

test('finance migration adds the finance staff role and locks custom permissions to operational modules', () => {
  const sql = financeMigration()
  assert.match(sql, /'stock'\s*,\s*'cashier'\s*,\s*'finance'\s*,\s*'manager'\s*,\s*'custom'/)
  assert.match(sql, /analysis\.financial/)
  assert.match(sql, /inventory\.write/)
  assert.match(sql, /checkout\.sell/)
  assert.doesNotMatch(sql, /allowed_custom_permissions[\s\S]*team\.manage/)
  assert.doesNotMatch(sql, /allowed_custom_permissions[\s\S]*settings\.manage/)
})

test('finance migration creates provider-neutral finance tables with RLS and server-only grants', () => {
  const sql = financeMigration()
  for (const table of ['balcao_finance_accounts', 'balcao_finance_transactions', 'balcao_finance_daily_metrics']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`))
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`))
  }
  assert.match(sql, /revoke all on table[\s\S]*balcao_finance_accounts[\s\S]*from public, anon, authenticated/i)
  assert.match(sql, /revoke all on table[\s\S]*balcao_finance_transactions[\s\S]*from public, anon, authenticated/i)
  assert.match(sql, /revoke all on table[\s\S]*balcao_finance_daily_metrics[\s\S]*from public, anon, authenticated/i)
  assert.match(sql, /grant all on table[\s\S]*balcao_finance_accounts[\s\S]*to service_role/i)
})

test('staff listing returns custom permissions so the management UI can describe personalized access', () => {
  const sql = financeMigration()
  assert.match(sql, /returns table[\s\S]*custom_permissions jsonb/i)
  assert.match(sql, /a\.custom_permissions/)
})
