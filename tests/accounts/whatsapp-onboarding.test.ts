import assert from 'node:assert/strict'
import test from 'node:test'
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
