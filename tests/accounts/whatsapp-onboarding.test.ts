import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const exists = (path: string) => existsSync(join(root, path))

test('website onboarding exposes optional RPG Capital WhatsApp consent', () => {
  const wizard = read('components/accounts/OnboardingWizard.tsx')
  assert.match(wizard, /whatsappConsent/)
  assert.match(wizard, /Aceito receber mensagens da RPG Capital pelo WhatsApp/)
  assert.match(wizard, /type="checkbox"/)

  const validation = read('lib/accounts/validation.ts')
  assert.match(validation, /whatsappConsent:\s*z\.boolean\(\)\.optional\(\)\.default\(false\)/)

  const route = read('app/api/balcao/onboarding/route.ts')
  assert.match(route, /onboarding_site/)
  assert.match(route, /recordWhatsAppConsent|balcao_record_whatsapp_consent/)
})

test('shared consent constants and pure inbound parser exist', async () => {
  for (const path of ['lib/legal/whatsappConsent.ts', 'lib/whatsapp/types.ts', 'lib/whatsapp/inbound.ts']) {
    assert.ok(exists(path), `expected ${path}`)
  }

  const inbound = await import('../../lib/whatsapp/inbound.ts')
  assert.equal(inbound.normalizeWaId('+55 (11) 93620-6235'), '5511936206235')
  assert.equal(inbound.isStopCommand(' PARAR '), true)
  assert.equal(inbound.isStopCommand('cancelar'), true)
  assert.equal(inbound.isStopCommand('oi'), false)

  const parsed = inbound.parseInboundWhatsAppMessages({
    entry: [{ changes: [{ value: {
      contacts: [{ wa_id: '5511999999999' }],
      messages: [{
        id: 'wamid.TEST',
        from: '5511999999999',
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'balcao_create_account', title: 'Criar minha conta' } },
      }],
    } }] }],
  })
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0]?.waId, '5511999999999')
  assert.equal(parsed[0]?.messageId, 'wamid.TEST')
  assert.equal(parsed[0]?.buttonId, 'balcao_create_account')

  assert.deepEqual(inbound.parseInboundWhatsAppMessages({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.status' }] } }] }] }), [])
})

test('database migration models WhatsApp identity, consent, link requests and idempotency', () => {
  const path = 'supabase/migrations/20260916_balcao_whatsapp_dual_onboarding.sql'
  assert.ok(exists(path), `expected ${path}`)
  const sql = read(path)
  for (const table of [
    'balcao_whatsapp_contacts',
    'balcao_whatsapp_consents',
    'balcao_whatsapp_link_requests',
    'balcao_whatsapp_webhook_events',
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, 'i'))
  }
  assert.match(sql, /enable row level security/gi)
  assert.match(sql, /onboarding_whatsapp/)
  assert.match(sql, /whatsapp_stop/)
  assert.match(sql, /balcao_whatsapp_create_business/)
  assert.match(sql, /balcao_whatsapp_link_business/)
  assert.doesNotMatch(sql, /grant\s+.*insert.*to\s+anon/i)
})

test('webhook implements Meta verification, onboarding buttons, STOP first and duplicate protection', () => {
  const path = 'app/api/whatsapp/webhook/route.ts'
  assert.ok(exists(path), `expected ${path}`)
  const route = read(path)
  assert.match(route, /hub\.verify_token/)
  assert.match(route, /hub\.challenge/)
  assert.match(route, /META_WHATSAPP_VERIFY_TOKEN/)

  const handlerPath = 'lib/whatsapp/handler.ts'
  assert.ok(exists(handlerPath), `expected ${handlerPath}`)
  const handler = read(handlerPath)
  assert.match(handler, /balcao_create_account/)
  assert.match(handler, /balcao_existing_account/)
  assert.match(handler, /balcao_consent_yes/)
  assert.match(handler, /balcao_consent_no/)
  assert.match(handler, /isStopCommand/)
  assert.match(handler, /balcao_whatsapp_webhook_events/)
  assert.match(handler, /PARAR/)
})

test('existing-account WhatsApp linking requires authenticated owner/admin approval', () => {
  const pagePath = 'app/whatsapp/vincular/page.tsx'
  const routePath = 'app/api/whatsapp/link/route.ts'
  assert.ok(exists(pagePath), `expected ${pagePath}`)
  assert.ok(exists(routePath), `expected ${routePath}`)

  const page = read(pagePath)
  assert.match(page, /login/)
  assert.match(page, /token/)

  const route = read(routePath)
  assert.match(route, /auth\.getUser/)
  assert.match(route, /owner|admin/)
  assert.match(route, /balcao_whatsapp_link_business/)
})

test('server secrets stay server-only and Meta client sends interactive buttons', () => {
  for (const path of ['lib/supabase/admin.ts', 'lib/whatsapp/cloud.ts']) assert.ok(exists(path), `expected ${path}`)
  const admin = read('lib/supabase/admin.ts')
  assert.match(admin, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(admin, /NEXT_PUBLIC_.*SECRET|NEXT_PUBLIC_.*SERVICE_ROLE/)

  const cloud = read('lib/whatsapp/cloud.ts')
  assert.match(cloud, /META_WHATSAPP_ACCESS_TOKEN/)
  assert.match(cloud, /META_WHATSAPP_PHONE_NUMBER_ID/)
  assert.match(cloud, /type:\s*'interactive'/)
  assert.match(cloud, /type:\s*'button'/)
})

test('legal pages keep explicit PARAR opt-out', () => {
  const privacy = read('app/privacidade/page.tsx')
  assert.match(privacy, /PARAR/)
  const terms = read('app/termos/page.tsx')
  const legalSource = read('lib/legal/onboardingTerms.ts')
  assert.match(`${terms}\n${legalSource}`, /PARAR/)
})
