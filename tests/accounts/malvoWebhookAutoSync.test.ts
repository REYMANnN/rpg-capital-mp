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

test('Malvo webhook authenticates Malvo but does not require Supabase service role in Vercel', () => {
  const webhook = source('app/api/balcao/finance/malvo/webhook/route.ts')
  assert.match(webhook, /MALVO_WEBHOOK_SECRET/)
  assert.doesNotMatch(webhook, /createAdminClient/)
  assert.match(webhook, /collectMalvoSnapshot/)
  assert.match(webhook, /balcao_process_malvo_webhook/)
})

test('webhook RPC journals events and derives tenant only from the Malvo clientUserId', () => {
  const migration = source('supabase/migrations/20260906_balcao_malvo_webhook_autosync.sql')
  assert.match(migration, /create or replace function public\.balcao_process_malvo_webhook/i)
  assert.match(migration, /security definer/i)
  assert.match(migration, /balcao_finance_webhook_events/i)
  assert.match(migration, /split_part\(p_client_user_id, ':', 2\)/i)
  assert.match(migration, /split_part\(p_client_user_id, ':', 3\)/i)
  assert.match(migration, /inventory_v1_stores/i)
  assert.match(migration, /on conflict \(account_id, external_id\) do update/i)
  assert.match(migration, /transactions\/deleted/i)
  assert.match(migration, /item\/deleted/i)
})

test('webhook RPC is idempotent by Malvo eventId and allows redelivery after processing errors', () => {
  const migration = source('supabase/migrations/20260906_balcao_malvo_webhook_autosync.sql')
  assert.match(migration, /23505/)
  assert.match(migration, /duplicate/i)
  assert.match(migration, /delete from public\.balcao_finance_webhook_events/i)
})
