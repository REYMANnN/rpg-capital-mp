import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

test('staff access links have a dedicated migration and public login flow', () => {
  const migration = join(root, 'supabase/migrations/20260831_balcao_staff_access_links.sql')
  assert.equal(existsSync(migration), true, 'expected staff access link migration')
  const sql = readFileSync(migration, 'utf8').toLowerCase()
  assert.match(sql, /create table[\s\S]*balcao_staff_access_links/)
  for (const fn of ['balcao_staff_access_info', 'balcao_staff_access_login', 'balcao_rotate_staff_access_link', 'balcao_operational_context', 'balcao_staff_session_logout']) {
    assert.match(sql, new RegExp(`function public\\.${fn}`))
  }
  assert.match(sql, /security definer/)
  assert.match(sql, /grant execute[\s\S]*to anon, authenticated/)
})

test('team manager exposes a copyable access link beside each staff member', () => {
  const source = readFileSync(join(root, 'components/accounts/TeamManager.tsx'), 'utf8')
  assert.match(source, /accessUrl/)
  assert.match(source, /Copiar link de acesso/)
  assert.match(source, /Novo link/)
})

test('staff access has its own page and API routes', () => {
  for (const path of [
    'app/acesso/[token]/page.tsx',
    'app/api/balcao/staff/access/[token]/info/route.ts',
    'app/api/balcao/staff/access/[token]/login/route.ts',
    'app/api/balcao/staff/[id]/access-link/route.ts',
  ]) {
    assert.equal(existsSync(join(root, path)), true, `missing ${path}`)
  }
})

test('new operational staff flow does not depend on Supabase service role', () => {
  for (const path of [
    'app/api/balcao/work/context/route.ts',
    'app/api/balcao/staff/logout/route.ts',
  ]) {
    const source = readFileSync(join(root, path), 'utf8')
    assert.equal(source.includes('@/lib/supabase/admin'), false, `${path} must not import admin client`)
    assert.equal(source.includes('createAdminClient'), false, `${path} must not use admin client`)
  }
})
