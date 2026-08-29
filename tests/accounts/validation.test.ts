import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidCnpj, isValidCpf, normalizeDigits, validateOnboarding, validatePixKey } from '../../lib/accounts/validation'

test('normalizeDigits removes Brazilian punctuation', () => {
  assert.equal(normalizeDigits('12.345.678/0001-95'), '12345678000195')
})

test('validates CPF check digits', () => {
  assert.equal(isValidCpf('529.982.247-25'), true)
  assert.equal(isValidCpf('111.111.111-11'), false)
  assert.equal(isValidCpf('529.982.247-24'), false)
})

test('validates CNPJ check digits', () => {
  assert.equal(isValidCnpj('04.252.011/0001-10'), true)
  assert.equal(isValidCnpj('11.111.111/1111-11'), false)
  assert.equal(isValidCnpj('04.252.011/0001-11'), false)
})

test('accepts common Pix key formats and optional blank key', () => {
  assert.equal(validatePixKey(''), true)
  assert.equal(validatePixKey('52998224725'), true)
  assert.equal(validatePixKey('+5512999999999'), true)
  assert.equal(validatePixKey('lojista@example.com'), true)
  assert.equal(validatePixKey('123e4567-e89b-12d3-a456-426614174000'), true)
  assert.equal(validatePixKey('abc'), false)
})

test('onboarding requires referral detail only when source is other', () => {
  const base = {
    businessName: 'Mercado São João',
    businessType: 'mercadinho',
    cep: '12240000',
    street: 'Rua das Flores',
    number: '10',
    city: 'São José dos Campos',
    state: 'SP',
    phone: '12999999999',
    taxId: '52998224725',
    pixKey: '',
  }
  assert.equal(validateOnboarding({ ...base, referralSource: 'google', referralOther: '' }).success, true)
  assert.equal(validateOnboarding({ ...base, referralSource: 'other', referralOther: '' }).success, false)
  assert.equal(validateOnboarding({ ...base, referralSource: 'other', referralOther: 'Feira local' }).success, true)
})
