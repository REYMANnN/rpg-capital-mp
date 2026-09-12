import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260912_balcao_automations_platform.sql'), 'utf8')

test('automations migration creates platform persistence and IT role', () => {
  for (const table of [
    'balcao_api_keys','balcao_integration_connections','balcao_integration_entity_mappings',
    'balcao_webhook_endpoints','balcao_event_outbox','balcao_webhook_deliveries','balcao_idempotency_records',
  ]) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`))
  assert.match(sql, /'it'/)
  for (const permission of ['automations.view','automations.manage','integrations.view','integrations.manage','api_keys.manage','webhooks.manage']) assert.match(sql, new RegExp(permission.replace('.', '\\.')))
  assert.match(sql, /service_role/)
  assert.match(sql, /enable row level security/i)
})
