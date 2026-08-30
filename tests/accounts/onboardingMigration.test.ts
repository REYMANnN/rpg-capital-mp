import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationPath = join(process.cwd(), 'supabase/migrations/20260830_balcao_onboarding_rpc_unambiguous.sql')

test('onboarding RPC migration removes the ambiguous business_id conflict target', () => {
  assert.equal(existsSync(migrationPath), true, 'expected an explicit migration fixing production 42702')
  const sql = readFileSync(migrationPath, 'utf8').toLowerCase()
  assert.equal(sql.includes('on conflict (business_id, user_id)'), false)
  assert.equal(sql.includes('on conflict on constraint balcao_business_members_pkey'), true)
  assert.equal(sql.includes("security definer"), true)
  assert.equal(sql.includes("set search_path = ''"), true)
  assert.equal(sql.includes('to authenticated'), true)
})

test('onboarding API keeps returning the existing RPC response contract', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/balcao/onboarding/route.ts'), 'utf8')
  assert.match(route, /business_id/)
  assert.match(route, /store_id/)
  assert.match(route, /installation_id/)
})
