import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const staffRoutes = [
  'app/api/balcao/staff/route.ts',
  'app/api/balcao/staff/[id]/route.ts',
  'app/api/balcao/staff/[id]/pin/route.ts',
]

test('staff management routes do not depend on the Supabase service role', () => {
  for (const path of staffRoutes) {
    const source = readFileSync(join(root, path), 'utf8')
    assert.equal(source.includes("@/lib/supabase/admin"), false, `${path} must not import the admin client`)
    assert.equal(source.includes('createAdminClient'), false, `${path} must not instantiate the admin client`)
  }
})

test('staff management uses authenticated SECURITY DEFINER RPCs', () => {
  const migrationPath = join(root, 'supabase/migrations/20260831_balcao_staff_management_rpcs.sql')
  assert.equal(existsSync(migrationPath), true, 'expected a migration for service-role-free staff management')
  const sql = readFileSync(migrationPath, 'utf8').toLowerCase()
  for (const fn of ['balcao_list_staff', 'balcao_create_staff', 'balcao_update_staff', 'balcao_reset_staff_pin']) {
    assert.match(sql, new RegExp(`function public\\.${fn}`))
  }
  assert.match(sql, /security definer/)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /grant execute[\s\S]*to authenticated/)
  assert.match(sql, /revoke all[\s\S]*from public, anon/)
})

test('team UI always exits the busy state when the request fails', () => {
  const source = readFileSync(join(root, 'components/accounts/TeamManager.tsx'), 'utf8')
  assert.match(source, /finally\s*\{/)
  assert.match(source, /setBusy\(false\)/)
  assert.match(source, /catch\s*\(/)
})
