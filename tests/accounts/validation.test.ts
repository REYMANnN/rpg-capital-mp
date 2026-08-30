import test from 'node:test'
import assert from 'node:assert/strict'
import * as validation from '../../lib/accounts/validation'

test('normalizeDigits removes Brazilian punctuation', () => {
  assert.equal(validation.normalizeDigits('12.345.678/0001-95'), '12345678000195')
})

test('validates CPF check digits', () => {
  assert.equal(validation.isValidCpf('529.982.247-25'), true)
  assert.equal(validation.isValidCpf('111.111.111-11'), false)
  assert.equal(validation.isValidCpf('529.982.247-24'), false)
})

test('validates CNPJ check digits', () => {
  assert.equal(validation.isValidCnpj('04.252.011/0001-10'), true)
  assert.equal(validation.isValidCnpj('11.111.111/1111-11'), false)
  assert.equal(validation.isValidCnpj('04.252.011/0001-11'), false)
})

test('formats CEP, phone and CPF/CNPJ progressively from pasted or typed digits', () => {
  const api = validation as unknown as Record<string, (...args: string[]) => string>
  assert.equal(typeof api.formatCep, 'function')
  assert.equal(typeof api.formatPhone, 'function')
  assert.equal(api.formatCep('12244038'), '12244-038')
  assert.equal(api.formatCep('12.244-038 qualquer coisa'), '12244-038')
  assert.equal(api.formatPhone('1299976690'), '(12) 9997-6690')
  assert.equal(api.formatPhone('12999976690'), '(12) 99997-6690')
  assert.equal(validation.formatTaxId('52998224725'), '529.982.247-25')
  assert.equal(validation.formatTaxId('04252011000110'), '04.252.011/0001-10')
})

test('normalizes and validates Pix according to the explicitly selected key type', () => {
  const api = validation as unknown as Record<string, (...args: string[]) => unknown>
  assert.equal(typeof api.formatPixKey, 'function')
  assert.equal(typeof api.normalizePixKey, 'function')
  assert.equal(typeof api.validatePixKeyForType, 'function')

  assert.equal(api.formatPixKey('phone', '12 9997-6690'), '(12) 9997-6690')
  assert.equal(api.normalizePixKey('phone', '(12) 9997-6690'), '+551299976690')
  assert.equal(api.normalizePixKey('email', ' Loja@Example.COM '), 'loja@example.com')
  assert.equal(api.normalizePixKey('cpf', '529.982.247-25'), '52998224725')
  assert.equal(api.normalizePixKey('cnpj', '04.252.011/0001-10'), '04252011000110')

  assert.equal(api.validatePixKeyForType('phone', '(12) 9997-6690'), true)
  assert.equal(api.validatePixKeyForType('cpf', '529.982.247-25'), true)
  assert.equal(api.validatePixKeyForType('cnpj', '04.252.011/0001-10'), true)
  assert.equal(api.validatePixKeyForType('email', 'lojista@example.com'), true)
  assert.equal(api.validatePixKeyForType('evp', '123e4567-e89b-12d3-a456-426614174000'), true)
  assert.equal(api.validatePixKeyForType('email', '12 9997-6690'), false)
  assert.equal(api.validatePixKeyForType('phone', 'abc'), false)
})

test('accepts common Pix key formats and optional blank key for backwards compatibility', () => {
  assert.equal(validation.validatePixKey(''), true)
  assert.equal(validation.validatePixKey('52998224725'), true)
  assert.equal(validation.validatePixKey('+5512999999999'), true)
  assert.equal(validation.validatePixKey('lojista@example.com'), true)
  assert.equal(validation.validatePixKey('123e4567-e89b-12d3-a456-426614174000'), true)
  assert.equal(validation.validatePixKey('abc'), false)
})

test('onboarding accepts an optional Pix and validates a selected Pix type when present', () => {
  const base = {
    businessName: 'Mercado São João',
    businessType: 'mercadinho',
    cep: '12244-038',
    street: 'Rua das Flores',
    number: '10',
    city: 'São José dos Campos',
    state: 'SP',
    phone: '(12) 99997-6690',
    taxId: '529.982.247-25',
    referralSource: 'google',
    referralOther: '',
  }

  assert.equal(validation.validateOnboarding({ ...base, pixType: '', pixKey: '' }).success, true)
  assert.equal(validation.validateOnboarding({ ...base, pixType: 'phone', pixKey: '(12) 9997-6690' }).success, true)
  assert.equal(validation.validateOnboarding({ ...base, pixType: 'phone', pixKey: 'abc' }).success, false)
  assert.equal(validation.validateOnboarding({ ...base, pixType: 'email', pixKey: 'lojista@example.com' }).success, true)
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
    pixType: '',
    pixKey: '',
  }
  assert.equal(validation.validateOnboarding({ ...base, referralSource: 'google', referralOther: '' }).success, true)
  assert.equal(validation.validateOnboarding({ ...base, referralSource: 'other', referralOther: '' }).success, false)
  assert.equal(validation.validateOnboarding({ ...base, referralSource: 'other', referralOther: 'Feira local' }).success, true)
})
