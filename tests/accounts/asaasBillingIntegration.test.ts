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

test('billing migration stores provider ids and payment state without card secrets', () => {
  const sql = source('supabase/migrations/20260906_balcao_asaas_billing.sql')
  assert.match(sql, /create table if not exists public\.balcao_billing_accounts/)
  assert.match(sql, /create table if not exists public\.balcao_billing_payments/)
  assert.match(sql, /create table if not exists public\.balcao_billing_webhook_events/)
  assert.match(sql, /past_due/)
  assert.match(sql, /reconnect_required/)
  assert.doesNotMatch(sql, /card_number|credit_card_number|ccv|cvv/i)
})

test('Asaas client uses the exact Balcao secret name and production authentication headers', () => {
  const client = source('lib/asaas/client.ts')
  assert.match(client, /ASAAS_API_KEY_balcao/)
  assert.match(client, /https:\/\/api\.asaas\.com\/v3/)
  assert.match(client, /access_token/)
  assert.match(client, /User-Agent/)
  assert.match(client, /createAsaasCustomer/)
  assert.match(client, /createAsaasCreditCardSubscription/)
  assert.match(client, /maxPayments/)
})

test('new onboarding inserts billing before the existing mandatory Malvo bank step', () => {
  const page = source('app/onboarding/page.tsx')
  const billing = source('components/accounts/OnboardingBillingStep.tsx')
  const bank = source('components/accounts/OnboardingBankStep.tsx')
  assert.match(page, /OnboardingBillingStep/)
  assert.match(page, /OnboardingBankStep/)
  assert.match(page, /billingConfigured/)
  assert.match(billing, /R\$ 5,99/)
  assert.match(billing, /todo dia 1/i)
  assert.match(billing, /autoriza.*cobrança recorrente/is)
  assert.match(bank, /conta bancária/i)
})

test('overdue Asaas payment blocks access and tears down Malvo consent', () => {
  const webhook = source('app/api/balcao/billing/asaas/webhook/route.ts')
  const server = source('lib/billing/server.ts')
  assert.match(webhook, /asaas-access-token/)
  assert.match(webhook, /PAYMENT_OVERDUE/)
  assert.match(webhook, /disconnectMalvoForBillingFailure/)
  assert.match(server, /deleteMalvoItem/)
  assert.match(server, /status:\s*'disconnected'/)
  assert.match(server, /reconnect_required/)
})

test('payment confirmation restores access but never silently reconnects Open Finance', () => {
  const webhook = source('app/api/balcao/billing/asaas/webhook/route.ts')
  const server = source('lib/billing/server.ts')
  assert.match(webhook, /PAYMENT_CONFIRMED/)
  assert.match(webhook, /PAYMENT_RECEIVED/)
  assert.match(server, /markBillingPaid/)
  assert.match(server, /reconnect_required:\s*true/)
  assert.doesNotMatch(server, /createMalvoConnectToken/)
})

test('operational context and management page enforce billing server-side', () => {
  const requestContext = source('lib/accounts/requestContext.ts')
  const manage = source('app/manage/page.tsx')
  assert.match(requestContext, /billingAllowsBusinessAccess/)
  assert.match(requestContext, /billingBlocked/)
  assert.match(manage, /billingAllowsBusinessAccess/)
  assert.match(manage, /redirect\('\/billing'\)/)
})

test('blocked account has a dedicated debt screen and can return after paying', () => {
  const page = source('app/billing/page.tsx')
  assert.match(page, /Pagamento pendente/)
  assert.match(page, /Pagar agora/)
  assert.match(page, /invoiceUrl/)
  assert.match(page, /Reconecte.*conta bancária/is)
})
