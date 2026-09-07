import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const billingUi = fs.readFileSync(new URL('../../components/accounts/OnboardingBillingStep.tsx', import.meta.url), 'utf8')
const billingApi = fs.readFileSync(new URL('../../app/api/balcao/billing/asaas/setup/route.ts', import.meta.url), 'utf8')
const legalTermsPath = new URL('../../lib/legal/terms.ts', import.meta.url)
const legalPagePath = new URL('../../app/termos/[slug]/page.tsx', import.meta.url)
const migrationPath = new URL('../../supabase/migrations/20260907_balcao_legal_acceptances.sql', import.meta.url)

test('billing UI requires three independent legal acceptances and links to each document', () => {
  for (const token of ['acceptedPaymentTerms', 'acceptedDataTerms', 'acceptedPlatformTerms']) {
    assert.match(billingUi, new RegExp(token))
  }
  for (const href of ['/termos/pagamento', '/termos/dados', '/termos/uso']) {
    assert.match(billingUi, new RegExp(href.replaceAll('/', '\\/')))
  }
  assert.match(billingUi, /disabled=\{busy \|\| !allAccepted\}/)
})

test('billing API rejects missing legal acceptances and records versions before billing configuration', () => {
  for (const token of ['acceptedPaymentTerms', 'acceptedDataTerms', 'acceptedPlatformTerms']) {
    assert.match(billingApi, new RegExp(token))
  }
  for (const token of ['paymentTermsVersion', 'dataTermsVersion', 'platformTermsVersion']) {
    assert.match(billingApi, new RegExp(token))
  }
  assert.match(billingApi, /balcao_record_legal_acceptances/)
})

test('legal documents are versioned, defensive, public and use the required contact address', () => {
  assert.equal(fs.existsSync(legalTermsPath), true)
  assert.equal(fs.existsSync(legalPagePath), true)
  const terms = fs.readFileSync(legalTermsPath, 'utf8')
  const page = fs.readFileSync(legalPagePath, 'utf8')

  for (const token of ['PAYMENT_TERMS_VERSION', 'DATA_TERMS_VERSION', 'PLATFORM_TERMS_VERSION']) {
    assert.match(terms, new RegExp(token))
  }
  assert.match(terms, /comercial@rpgcapital\.com\.br/g)
  assert.match(terms, /não garante.{0,80}(ininterrupt|indisponibilidade|falhas)/i)
  assert.match(terms, /(lucros cessantes|danos indiretos)/i)
  assert.match(terms, /(força maior|serviços de terceiros|terceiros)/i)
  assert.match(terms, /(LGPD|Lei nº 13\.709|Lei 13\.709)/i)
  assert.match(terms, /(backup|exporta|cópia)/i)
  assert.match(page, /getLegalDocument/)
})

test('database stores immutable evidence of the three accepted versions with actor and request context', () => {
  assert.equal(fs.existsSync(migrationPath), true)
  const migration = fs.readFileSync(migrationPath, 'utf8')
  assert.match(migration, /create table if not exists public\.balcao_legal_acceptances/i)
  assert.match(migration, /term_type/i)
  assert.match(migration, /term_version/i)
  assert.match(migration, /actor_user_id/i)
  assert.match(migration, /accepted_at/i)
  assert.match(migration, /ip_address/i)
  assert.match(migration, /user_agent/i)
  assert.match(migration, /balcao_record_legal_acceptances/i)
})
