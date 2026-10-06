import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isValidCnpj,
  isValidCpf,
  parseExplicitPixKey,
  pixReminder,
} from '../lib/rafa-pix-core.ts'

test('validates CPF and CNPJ check digits', () => {
  assert.equal(isValidCpf('529.982.247-25'), true)
  assert.equal(isValidCpf('529.982.247-24'), false)
  assert.equal(isValidCnpj('11.222.333/0001-81'), true)
  assert.equal(isValidCnpj('11.222.333/0001-80'), false)
})

test('captures explicit email Pix key', () => {
  assert.deepEqual(parseExplicitPixKey('minha chave pix é loja@exemplo.com'), {
    status: 'valid', type: 'email', key: 'loja@exemplo.com',
  })
})

test('captures explicit EVP Pix key', () => {
  assert.deepEqual(parseExplicitPixKey('minha chave é 550e8400-e29b-41d4-a716-446655440000'), {
    status: 'valid', type: 'evp', key: '550e8400-e29b-41d4-a716-446655440000',
  })
})

test('captures explicit CPF Pix key and strips punctuation', () => {
  assert.deepEqual(parseExplicitPixKey('pix: 529.982.247-25'), {
    status: 'valid', type: 'cpf', key: '52998224725',
  })
})

test('captures explicit Brazilian phone Pix key in E.164 form', () => {
  assert.deepEqual(parseExplicitPixKey('usa essa chave pix +55 (11) 99999-9999'), {
    status: 'valid', type: 'phone', key: '+5511999999999',
  })
})

test('does not auto-save a phone without Pix/key intent', () => {
  assert.deepEqual(parseExplicitPixKey('meu telefone é 11 99999-9999'), { status: 'none' })
})

test('rejects two valid Pix candidates as ambiguous', () => {
  assert.deepEqual(parseExplicitPixKey('pix: loja@exemplo.com ou 529.982.247-25'), { status: 'ambiguous' })
})

test('explicit Pix context with invalid candidate returns invalid', () => {
  assert.deepEqual(parseExplicitPixKey('minha chave pix é 123'), { status: 'invalid' })
})

test('Pix reminder is short and explicitly refuses banking secrets', () => {
  const text = pixReminder()
  assert.match(text, /chave Pix/i)
  assert.match(text, /receber pagamentos/i)
  assert.match(text, /senha/i)
  assert.match(text, /código do banco/i)
  assert.ok(text.length < 300)
})
