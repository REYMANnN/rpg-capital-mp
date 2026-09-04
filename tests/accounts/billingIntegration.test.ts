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

test('billing schema stores accounts, paid slots, idempotent operations and webhook events', () => {
  const migration = source('supabase/migrations/20260904_balcao_asaas_billing.sql')
  assert.match(migration, /create table if not exists public\.balcao_billing_accounts/i)
  assert.match(migration, /create table if not exists public\.balcao_billing_slots/i)
  assert.match(migration, /create table if not exists public\.balcao_billing_operations/i)
  assert.match(migration, /create table if not exists public\.balcao_billing_webhook_events/i)
  assert.match(migration, /idempotency_key[^\n]+unique/i)
  assert.match(migration, /event_id[^\n]+unique/i)
  assert.match(migration, /available|reserved|connected|retired/i)
})

test('billing policy centralizes R$5.99 price and owner test-account bypass', () => {
  const config = source('lib/billing/config.ts')
  const access = source('lib/billing/access.ts')
  assert.match(config, /599/)
  assert.match(config, /renanguadalupe05@gmail\.com/i)
  assert.match(access, /isBillingBypassEmail/)
  assert.match(access, /getBusinessBillingState/)
  assert.match(access, /hasBillingAccess/)
})

test('Asaas client keeps API key server-side and creates hosted recurring and detached checkouts', () => {
  const client = source('lib/asaas/client.ts')
  assert.match(client, /ASAAS_API_KEY/)
  assert.match(client, /api-sandbox\.asaas\.com\/v3/)
  assert.match(client, /api\.asaas\.com\/v3/)
  assert.match(client, /\/checkouts/)
  assert.match(client, /RECURRENT/)
  assert.match(client, /DETACHED/)
  assert.match(client, /updatePendingPayments:\s*false/)
  assert.match(client, /access_token/)
  assert.doesNotMatch(client, /ccv|cardNumber|creditCard\s*:/i)
})

test('onboarding inserts hosted billing before the mandatory bank connection but bypass account can skip it', () => {
  const page = source('app/onboarding/page.tsx')
  const component = source('components/accounts/OnboardingBillingStep.tsx')
  const startRoute = source('app/api/balcao/billing/onboarding/start/route.ts')
  assert.match(page, /OnboardingBillingStep/)
  assert.match(page, /getBusinessBillingState/)
  assert.match(component, /R\$\s*5,99/)
  assert.match(component, /Ir para pagamento/)
  assert.match(startRoute, /isBillingBypassEmail/)
  assert.match(startRoute, /createRecurringCheckout/)
  assert.match(startRoute, /checkoutUrl/)
})

test('manage and Malvo are protected by server-side billing access', () => {
  const manage = source('app/manage/page.tsx')
  const connect = source('app/api/balcao/finance/malvo/connect-token/route.ts')
  const sync = source('app/api/balcao/finance/malvo/sync/route.ts')
  assert.match(manage, /hasBillingAccess/)
  assert.match(manage, /\/billing/)
  assert.match(connect, /reserveBillingSlot/)
  assert.match(connect, /402/)
  assert.match(sync, /hasBillingAccess/)
  assert.match(sync, /402/)
})

test('billing page and API expose safe summary without payment secrets', () => {
  const page = source('app/billing/page.tsx')
  const route = source('app/api/balcao/billing/route.ts')
  assert.match(page, /Plano e pagamento|Pagamento pendente/)
  assert.match(route, /nextAmountCents/)
  assert.doesNotMatch(route, /apiKey|credit_card_token|ASAAS_API_KEY/)
})

test('adding a bank creates a R$5.99 detached checkout before Malvo and removal changes only future billing', () => {
  const add = source('app/api/balcao/billing/banks/add/route.ts')
  const connections = source('app/inventory-v1/finance/BankConnections.tsx')
  const remove = source('app/api/balcao/finance/connections/[id]/route.ts')
  assert.match(add, /createDetachedCheckout/)
  assert.match(add, /BANK_PRICE_CENTS/)
  assert.match(connections, /R\$5,99|R\$ 5,99/)
  assert.match(connections, /próxima mensalidade/i)
  assert.match(remove, /retireBillingSlot/)
  assert.match(remove, /updateSubscriptionValue/)
})

test('Asaas webhook is authenticated, idempotent and activates checkout entitlements', () => {
  const webhook = source('app/api/balcao/billing/asaas/webhook/route.ts')
  assert.match(webhook, /ASAAS_WEBHOOK_TOKEN/)
  assert.match(webhook, /asaas-access-token/i)
  assert.match(webhook, /timingSafeEqual/)
  assert.match(webhook, /balcao_billing_webhook_events/)
  assert.match(webhook, /23505/)
  assert.match(webhook, /CHECKOUT_PAID/)
  assert.match(webhook, /PAYMENT_OVERDUE/)
})
