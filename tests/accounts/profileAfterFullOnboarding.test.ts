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

test('partial onboarding stores a draft but does not create a Balcao profile', () => {
  const sql = source('supabase/migrations/20260906_balcao_profile_only_after_full_onboarding.sql')
  assert.match(sql, /create table if not exists public\.balcao_onboarding_drafts/)
  assert.match(sql, /create or replace function public\.balcao_complete_onboarding/)
  assert.match(sql, /insert into public\.balcao_onboarding_drafts/)

  const beforeFinalization = sql.split('create or replace function public.balcao_complete_open_finance_onboarding')[0]
  assert.doesNotMatch(beforeFinalization, /insert into public\.balcao_profiles/)
})

test('final onboarding creates the profile only after billing and Malvo are both valid', () => {
  const sql = source('supabase/migrations/20260906_balcao_profile_only_after_full_onboarding.sql')
  const finalization = sql.split('create or replace function public.balcao_complete_open_finance_onboarding')[1] ?? ''
  assert.match(finalization, /BALCAO_BILLING_REQUIRED/)
  assert.match(finalization, /BALCAO_OPEN_FINANCE_REQUIRED/)
  assert.match(finalization, /insert into public\.balcao_profiles/)
  assert.match(finalization, /onboarding_completed/)
  assert.match(finalization, /true/)
  assert.match(finalization, /delete from public\.balcao_onboarding_drafts/)
})
