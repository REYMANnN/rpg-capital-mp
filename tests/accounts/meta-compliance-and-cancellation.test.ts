import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

test('public terms page exposes all four onboarding terms in one place', () => {
  const page = read('app/termos/page.tsx')
  assert.match(page, /onboardingTerms/)
  assert.match(page, /Termos e Condições/)
  for (const anchor of ['uso', 'comerciais', 'dados', 'ia']) {
    assert.match(page, new RegExp(`id=["']${anchor}["']`))
  }
  assert.match(page, /\/privacidade/)
})

test('signup offers explicit optional WhatsApp consent and validates the boolean', () => {
  const wizard = read('components/accounts/OnboardingWizard.tsx')
  assert.match(wizard, /whatsappConsent/)
  assert.match(wizard, /Aceito receber mensagens da RPG Capital pelo WhatsApp/)
  assert.match(wizard, /type="checkbox"/)

  const validation = read('lib/accounts/validation.ts')
  assert.match(validation, /whatsappConsent:\s*z\.boolean\(\)\.optional\(\)\.default\(false\)/)
})

test('WhatsApp opt-in is stored as an auditable consent event', () => {
  const migrationPath = 'supabase/migrations/20260916_balcao_meta_consent_and_account_cancellation.sql'
  assert.ok(existsSync(join(root, migrationPath)), `expected ${migrationPath}`)
  const migration = read(migrationPath)
  assert.match(migration, /create table if not exists public\.balcao_whatsapp_consents/i)
  assert.match(migration, /consented_at/i)
  assert.match(migration, /policy_version/i)
  assert.match(migration, /source/i)
  assert.match(migration, /balcao_record_whatsapp_consent/i)

  const route = read('app/api/balcao/onboarding/route.ts')
  assert.match(route, /WHATSAPP_CONSENT_VERSION/)
  assert.match(route, /balcao_record_whatsapp_consent/)
  assert.match(route, /data\.whatsappConsent/)
})

test('settings exposes a simple confirmed account cancellation flow', () => {
  const shell = read('components/accounts/ManageShell.tsx')
  assert.match(shell, /Cancelar minha conta/)
  assert.match(shell, /Confirmar cancelamento/)
  assert.match(shell, /\/api\/balcao\/account\/cancel/)

  const routePath = 'app/api/balcao/account/cancel/route.ts'
  assert.ok(existsSync(join(root, routePath)), `expected ${routePath}`)
  const route = read(routePath)
  assert.match(route, /cancelAsaasSubscription/)
  assert.match(route, /balcao_cancel_business_account/)
  assert.match(route, /role !== 'owner'/)
})

test('cancellation removes future Asaas recurrence and deactivates access without deleting history', () => {
  const client = read('lib/asaas/client.ts')
  assert.match(client, /export async function cancelAsaasSubscription/)
  assert.match(client, /method:\s*'DELETE'/)
  assert.match(client, /subscriptions\/\$\{encodeURIComponent\(subscriptionId\)\}/)

  const migration = read('supabase/migrations/20260916_balcao_meta_consent_and_account_cancellation.sql')
  assert.match(migration, /status = 'cancelled'/)
  assert.match(migration, /update public\.balcao_businesses[\s\S]*active = false/i)
  assert.match(migration, /update public\.inventory_v1_stores[\s\S]*active = false/i)
  assert.doesNotMatch(migration, /delete\s+from\s+public\.balcao_businesses/i)
})
