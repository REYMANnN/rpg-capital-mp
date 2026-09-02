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

test('finance schema stores provider connections and idempotent Malvo webhook events', () => {
  const migration = source('supabase/migrations/20260902_balcao_malvo_production.sql')
  assert.match(migration, /create table if not exists public\.balcao_finance_connections/)
  assert.match(migration, /provider_item_id/)
  assert.match(migration, /client_user_id/)
  assert.match(migration, /create table if not exists public\.balcao_finance_webhook_events/)
  assert.match(migration, /event_id[\s\S]*unique/i)
  assert.match(migration, /'businessId'/)
  assert.match(migration, /'storeId'/)
})

test('Malvo server client keeps permanent credentials server-side and requests only accounts and transactions', () => {
  const client = source('lib/malvo/client.ts')
  assert.match(client, /MALVO_CLIENT_ID/)
  assert.match(client, /MALVO_CLIENT_SECRET/)
  assert.match(client, /https:\/\/api\.malvo\.io\/auth/)
  assert.match(client, /https:\/\/api\.malvo\.io\/connect_token/)
  assert.match(client, /ACCOUNTS/)
  assert.match(client, /TRANSACTIONS/)
  assert.match(client, /avoidDuplicates/)
  assert.match(client, /MALVO_WEBHOOK_SECRET/)
  assert.match(client, /\/webhooks/)
})

test('Malvo sync maps real accounts and transactions into provider-neutral Balcao finance tables', () => {
  const sync = source('lib/malvo/sync.ts')
  assert.match(sync, /balcao_finance_connections/)
  assert.match(sync, /balcao_finance_accounts/)
  assert.match(sync, /balcao_finance_transactions/)
  assert.match(sync, /provider: 'malvo'/)
  assert.match(sync, /source: 'malvo'/)
  assert.match(sync, /paymentData/)
  assert.match(sync, /merchant/)
  assert.match(sync, /operationType/)
})

test('authenticated management can mint a connect token but finance staff cannot change bank consent', () => {
  const route = source('app/api/balcao/finance/malvo/connect-token/route.ts')
  assert.match(route, /balcao_finance_dashboard_source/)
  assert.match(route, /authorization/)
  assert.match(route, /google/)
  assert.match(route, /403/)
  assert.match(route, /createMalvoConnectToken/)
})

test('webhook requires a shared secret, deduplicates eventId, and synchronizes authoritative item updates', () => {
  const webhook = source('app/api/balcao/finance/malvo/webhook/route.ts')
  assert.match(webhook, /MALVO_WEBHOOK_SECRET/)
  assert.match(webhook, /timingSafeEqual/)
  assert.match(webhook, /eventId/)
  assert.match(webhook, /balcao_finance_webhook_events/)
  assert.match(webhook, /item\/created/)
  assert.match(webhook, /item\/updated/)
  assert.match(webhook, /transactions\/created/)
  assert.match(webhook, /transactions\/updated/)
  assert.match(webhook, /syncMalvoItem/)
})

test('finance UI has a real bank connections area and uses the hosted Malvo Connect widget', () => {
  const dashboard = source('app/inventory-v1/FinanceDashboard.tsx')
  const connections = source('app/inventory-v1/finance/BankConnections.tsx')
  assert.match(dashboard, /Conexões/)
  assert.match(dashboard, /BankConnections/)
  assert.match(connections, /Conectar conta bancária/)
  assert.match(connections, /malvo\.io\/widget\.js/)
  assert.match(connections, /BUSINESS_BANK/)
  assert.match(connections, /countries:\s*\['BR'\]/)
  assert.match(connections, /includeSandbox:\s*false/)
  assert.match(connections, /\/api\/balcao\/finance\/malvo\/connect-token/)
  assert.match(connections, /\/api\/balcao\/finance\/connections/)
})

test('production cleanup removes finance mock rows without removing operational sales data', () => {
  const cleanup = source('supabase/migrations/20260902_balcao_remove_finance_mock_data.sql')
  assert.match(cleanup, /delete from public\.balcao_finance_transactions[\s\S]*source = 'mock'/)
  assert.match(cleanup, /delete from public\.balcao_finance_accounts[\s\S]*source = 'mock'/)
  assert.match(cleanup, /delete from public\.balcao_finance_daily_metrics[\s\S]*source = 'mock'/)
  assert.doesNotMatch(cleanup, /inventory_v1_sales/)
})
