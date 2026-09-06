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

test('production Malvo webhook no longer depends on the Vercel Supabase service role', () => {
  const webhook = source('app/api/balcao/finance/malvo/webhook/route.ts')
  assert.doesNotMatch(webhook, /createAdminClient/)
  assert.match(webhook, /forwardMalvoWebhookToEdge/)
  assert.match(webhook, /MALVO_WEBHOOK_SECRET/)
  assert.match(webhook, /timingSafeEqual/)
})

test('Vercel forwards Malvo work to the privileged Supabase Edge runtime using Vercel OIDC', () => {
  const bridge = source('lib/malvo/edgeRuntime.ts')
  assert.match(bridge, /x-vercel-oidc-token/)
  assert.match(bridge, /balcao-malvo-ingest/)
  assert.match(bridge, /MALVO_CLIENT_ID/)
  assert.match(bridge, /MALVO_CLIENT_SECRET/)
  assert.match(bridge, /MALVO_WEBHOOK_SECRET/)
  assert.match(bridge, /bootstrap/)
  assert.match(bridge, /forward-webhook/)
})

test('Supabase Edge runtime authenticates Vercel and Malvo, journals events, and processes work in background', () => {
  const edge = source('supabase/functions/balcao-malvo-ingest/index.ts')
  assert.match(edge, /jwtVerify/)
  assert.match(edge, /prj_d2elDb254SXSBjzNhGRE6UR8fAfc/)
  assert.match(edge, /team_HF88ws9zOEewBPwDBvmBDzjG/)
  assert.match(edge, /balcao_finance_webhook_events/)
  assert.match(edge, /EdgeRuntime\.waitUntil/)
  assert.match(edge, /balcao_finance_connections/)
  assert.match(edge, /balcao_finance_accounts/)
  assert.match(edge, /balcao_finance_transactions/)
  assert.match(edge, /\/v2\/transactions/)
})

test('Malvo runtime secrets stay encrypted in Supabase Vault and reconciliation is scheduled', () => {
  const migration = source('supabase/migrations/20260906_balcao_malvo_continuous_sync.sql')
  assert.match(migration, /vault\.create_secret/)
  assert.match(migration, /vault\.update_secret/)
  assert.match(migration, /balcao_store_malvo_runtime_secrets/)
  assert.match(migration, /balcao_get_malvo_runtime_secrets/)
  assert.match(migration, /balcao_malvo_reconcile_secret_matches/)
  assert.match(migration, /cron\.schedule/)
  assert.match(migration, /\*\/15 \* \* \* \*/)
  assert.match(migration, /balcao-malvo-ingest/)
})

test('new Malvo connections use the direct Supabase Edge webhook after bootstrapping it', () => {
  const route = source('app/api/balcao/finance/malvo/connect-token/route.ts')
  assert.match(route, /bootstrapMalvoEdgeRuntime/)
  assert.match(route, /getMalvoEdgeWebhookUrl/)
  assert.doesNotMatch(route, /`\$\{origin\}\/api\/balcao\/finance\/malvo\/webhook`/)
})
