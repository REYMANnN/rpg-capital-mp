import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  WHATSAPP_BUTTONS,
  isStopCommand,
  normalizeWhatsAppPhone,
  parseWhatsAppWebhook,
} from '../../lib/whatsapp/onboarding'

test('normalizes Brazilian WhatsApp numbers to country-code digits', () => {
  assert.equal(normalizeWhatsAppPhone('+55 (11) 93620-6235'), '5511936206235')
  assert.equal(normalizeWhatsAppPhone('11 93620-6235'), '5511936206235')
  assert.equal(normalizeWhatsAppPhone('5511936206235'), '5511936206235')
})

test('recognizes PARAR regardless of case or surrounding spaces', () => {
  assert.equal(isStopCommand('PARAR'), true)
  assert.equal(isStopCommand('  parar  '), true)
  assert.equal(isStopCommand('quero parar depois'), false)
})

test('uses stable button ids for onboarding actions', () => {
  assert.deepEqual(WHATSAPP_BUTTONS, {
    createAccount: 'balcao_create_account',
    existingAccount: 'balcao_existing_account',
    consentYes: 'balcao_consent_yes',
    consentNo: 'balcao_consent_no',
  })
})

test('parses text and interactive button replies from Meta webhook payloads', () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { messages: [
      { id: 'wamid.text', from: '5511999999999', type: 'text', text: { body: 'oi' } },
      { id: 'wamid.button', from: '5511888888888', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: WHATSAPP_BUTTONS.consentYes, title: 'Sim, pode mandar' } } },
    ] } }] }],
  }

  assert.deepEqual(parseWhatsAppWebhook(payload), [
    { messageId: 'wamid.text', from: '5511999999999', kind: 'text', value: 'oi' },
    { messageId: 'wamid.button', from: '5511888888888', kind: 'button', value: WHATSAPP_BUTTONS.consentYes },
  ])
})

test('ignores webhook changes without supported inbound messages', () => {
  assert.deepEqual(parseWhatsAppWebhook({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.status' }] } }] }] }), [])
})

test('migration stores consent, conversation state and secure link codes with RLS', () => {
  const sql = readFileSync('supabase/migrations/20260916_balcao_whatsapp_dual_onboarding.sql', 'utf8')
  assert.match(sql, /create table if not exists public\.balcao_whatsapp_consents/i)
  assert.match(sql, /event_type text not null.*granted.*revoked/is)
  assert.match(sql, /create table if not exists public\.balcao_whatsapp_sessions/i)
  assert.match(sql, /create table if not exists public\.balcao_whatsapp_link_codes/i)
  assert.match(sql, /code_hash text not null/i)
  assert.match(sql, /enable row level security/gi)
  assert.match(sql, /revoke all on public\.balcao_whatsapp_consents from public, anon, authenticated/i)
  assert.match(sql, /balcao_record_whatsapp_consent/i)
})
