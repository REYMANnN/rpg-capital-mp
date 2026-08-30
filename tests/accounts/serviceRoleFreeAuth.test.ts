import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return fs.readFileSync(path, 'utf8')
}

test('account state reads use the authenticated server client, not service role', () => {
  const currentUser = source('lib/accounts/currentUser.ts')
  assert.doesNotMatch(currentUser, /createAdminClient/)
  assert.match(currentUser, /createServerClient/)
})

test('onboarding uses one authenticated RPC and does not require service role', () => {
  const onboarding = source('app/api/balcao/onboarding/route.ts')
  assert.doesNotMatch(onboarding, /createAdminClient/)
  assert.match(onboarding, /balcao_complete_onboarding/)
  assert.match(onboarding, /createServerClient/)
})

test('onboarding RPC derives identity from auth.uid and is restricted to authenticated users', () => {
  const migration = source('supabase/migrations/20260830_balcao_onboarding_rpc.sql')
  assert.match(migration, /security definer/i)
  assert.match(migration, /auth\.uid\(\)/)
  assert.match(migration, /set search_path = ''/i)
  assert.match(migration, /revoke all on function public\.balcao_complete_onboarding/i)
  assert.match(migration, /grant execute on function public\.balcao_complete_onboarding[\s\S]*to authenticated/i)
})
