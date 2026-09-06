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

test('new onboarding requires Asaas billing before Malvo', () => {
  const page = source('app/onboarding/page.tsx')
  const billing = source('components/accounts/OnboardingBillingStep.tsx')
  assert.match(page, /OnboardingBillingStep/)
  assert.match(page, /billingConfigured/)
  assert.match(page, /OnboardingBankStep/)
  assert.ok(page.indexOf('!billingConfigured') < page.indexOf('<OnboardingBankStep'))
  assert.match(billing, /R\$ 5,99/)
  assert.match(billing, /Continuar para conectar o banco/)
})

test('billing setup never depends on Supabase service role', () => {
  const route = source('app/api/balcao/billing/asaas/setup/route.ts')
  assert.doesNotMatch(route, /createAdminClient|SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(route, /balcao_configure_billing/)
})

test('database owns the billing gate and only owner or admin can configure it', () => {
  const sql = source('supabase/migrations/20260906_balcao_asaas_before_malvo.sql')
  assert.match(sql, /create table if not exists public\.balcao_billing_accounts/)
  assert.match(sql, /create or replace function public\.balcao_configure_billing/)
  assert.match(sql, /create or replace function public\.balcao_billing_allows_bank_connection/)
  assert.match(sql, /owner.*admin/is)
  assert.doesNotMatch(sql, /card_number|credit_card_number|ccv|cvv/i)
})

test('Malvo token and completion are both blocked until billing is configured', () => {
  const connect = source('app/api/balcao/finance/malvo/connect-token/route.ts')
  const complete = source('app/api/balcao/finance/malvo/complete/route.ts')
  assert.match(connect, /balcao_billing_allows_bank_connection/)
  assert.match(complete, /balcao_billing_allows_bank_connection/)
})

test('Asaas client accepts the production BALCAO key name', () => {
  const client = source('lib/asaas/client.ts')
  assert.match(client, /ASAAS_API_KEY/)
  assert.match(client, /https:\/\/api\.asaas\.com\/v3/)
  assert.match(client, /access_token/)
})
