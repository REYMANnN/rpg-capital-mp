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

test('Malvo webhook authenticates Malvo and hands persistence to Supabase with Vercel OIDC', () => {
  const webhook = source('app/api/balcao/finance/malvo/webhook/route.ts')
  assert.match(webhook, /MALVO_WEBHOOK_SECRET/)
  assert.doesNotMatch(webhook, /createAdminClient/)
  assert.match(webhook, /collectMalvoSnapshot/)
  assert.match(webhook, /VERCEL_OIDC_TOKEN/)
  assert.match(webhook, /functions\/v1\/balcao-malvo-webhook/)
  assert.doesNotMatch(webhook, /supabase\.rpc\('balcao_process_malvo_webhook'/)
})

test('Supabase Edge Function verifies the exact production Vercel workload before service-role writes', () => {
  const edge = source('supabase/functions/balcao-malvo-webhook/index.ts')
  assert.match(edge, /jwtVerify/)
  assert.match(edge, /VERCEL_TEAM_SLUG\s*=\s*'renanguadalupe05-5169s-projects'/)
  assert.match(edge, /VERCEL_PROJECT\s*=\s*'rpg-capital-mp-25zw'/)
  assert.match(edge, /VERCEL_ISSUER/)
  assert.match(edge, /VERCEL_AUDIENCE/)
  assert.match(edge, /VERCEL_SUBJECT/)
  assert.match(edge, /environment:production/)
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(edge, /balcao_process_malvo_webhook/)
})

test('webhook RPC journals events, derives tenant from Malvo clientUserId, and ends service-role only', () => {
  const migration = source('supabase/migrations/20260906_balcao_malvo_webhook_autosync.sql')
  const lock = source('supabase/migrations/20260906_balcao_malvo_webhook_service_role_only.sql')
  assert.match(migration, /create or replace function public\.balcao_process_malvo_webhook/i)
  assert.match(migration, /security definer/i)
  assert.match(migration, /balcao_finance_webhook_events/i)
  assert.match(migration, /split_part\(p_client_user_id, ':', 2\)/i)
  assert.match(migration, /split_part\(p_client_user_id, ':', 3\)/i)
  assert.match(migration, /inventory_v1_stores/i)
  assert.match(migration, /on conflict \(account_id, external_id\) do update/i)
  assert.match(migration, /transactions\/deleted/i)
  assert.match(migration, /item\/deleted/i)
  assert.match(lock, /revoke all[\s\S]*from public, anon, authenticated/i)
  assert.match(lock, /grant execute[\s\S]*to service_role/i)
})

test('webhook RPC is idempotent by Malvo eventId and allows redelivery after processing errors', () => {
  const migration = source('supabase/migrations/20260906_balcao_malvo_webhook_autosync.sql')
  assert.match(migration, /unique_violation/)
  assert.match(migration, /duplicate/i)
  assert.match(migration, /delete from public\.balcao_finance_webhook_events/i)
})
