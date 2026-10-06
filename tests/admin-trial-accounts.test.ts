import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeTrialPhone, validateTrialInput } from '../lib/admin/trial-accounts-core.ts'

test('normalizes Brazilian mobile phone to E.164 digits', () => {
  assert.equal(normalizeTrialPhone('(11) 99999-9999'), '5511999999999')
  assert.equal(normalizeTrialPhone('+55 11 99999-9999'), '5511999999999')
})

test('rejects invalid Brazilian phone', () => {
  assert.equal(normalizeTrialPhone('123'), null)
})

test('validates the only three trial creation fields', () => {
  assert.deepEqual(validateTrialInput({ contactName: ' Carlos ', businessName: ' Mercadinho Avenida ', phone: '(11) 99999-9999' }), {
    ok: true,
    value: { contactName: 'Carlos', businessName: 'Mercadinho Avenida', phone: '5511999999999' },
  })
})

test('requires contact name', () => {
  assert.deepEqual(validateTrialInput({ contactName: '  ', businessName: 'Loja', phone: '11999999999' }), {
    ok: false, error: 'missing_contact_name',
  })
})

test('requires business name', () => {
  assert.deepEqual(validateTrialInput({ contactName: 'Carlos', businessName: '', phone: '11999999999' }), {
    ok: false, error: 'missing_business_name',
  })
})

test('returns invalid_phone for malformed phone', () => {
  assert.deepEqual(validateTrialInput({ contactName: 'Carlos', businessName: 'Loja', phone: '123' }), {
    ok: false, error: 'invalid_phone',
  })
})
