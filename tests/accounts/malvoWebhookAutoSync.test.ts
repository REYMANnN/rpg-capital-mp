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

test('Malvo webhook no longer depends on SUPABASE_SERVICE_ROLE_KEY in Vercel', () => {
  const webhook = source('app/api/balcao/finance/malvo/webhook/route.ts')
  assert.doesNotMatch(webhook, /createAdminClient/)
  assert.match(webhook, /balcao_process_malvo_webhook/)
  assert.match(webhook, /MALVO_WEBHOOK_SECRET/)
})

test('webhook RPC independently verifies the Malvo shared secret before privileged writes', () => {
  const migration = source('supabase/migrations/20260906_balcao_malvo_webhook_autosync.sql')
  assert.match(migration, /create extension if not exists http/i)
  assert.match(migration, /create or replace function public\.balcao_process_malvo_webhook/i)
  assert.match(migration, /extensions\.http\(/i)
  assert.match(migration, /\/api\/balcao\/finance\/malvo\/verify/i)
  assert.match(migration, /BALCAO_MALVO_WEBHOOK_UNAUTHORIZED/)
  assert.match(migration, /balcao_finance_webhook_events/)
})

test('Malvo secret verifier is constant-time and server-only', () => {
  const verifier = source('app/api/balcao/finance/malvo/verify/route.ts')
  assert.match(verifier, /timingSafeEqual/)
  assert.match(verifier, /MALVO_WEBHOOK_SECRET/)
  assert.match(verifier, /Unauthorized/)
})
