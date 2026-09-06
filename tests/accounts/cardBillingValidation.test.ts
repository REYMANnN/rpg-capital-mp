import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatCardNumber,
  formatCpfCnpj,
  formatPostalCode,
  formatPhone,
  normalizeExpiryYear,
  validateAndNormalizeBillingInput,
} from '../../lib/billing/cardValidation.ts'

test('masks common Brazilian billing inputs while keeping only supported lengths', () => {
  assert.equal(formatCardNumber('4111-1111 1111.1111'), '4111 1111 1111 1111')
  assert.equal(formatCpfCnpj('12345678901'), '123.456.789-01')
  assert.equal(formatCpfCnpj('12345678000199'), '12.345.678/0001-99')
  assert.equal(formatPostalCode('12243000'), '12243-000')
  assert.equal(formatPhone('12997673260'), '(12) 99767-3260')
})

test('normalizes two-digit expiry year to the four-digit format Asaas expects', () => {
  assert.equal(normalizeExpiryYear('30'), '2030')
  assert.equal(normalizeExpiryYear('2030'), '2030')
  assert.equal(normalizeExpiryYear('2'), '2')
})

test('accepts masked user input and returns canonical Asaas payload', () => {
  const result = validateAndNormalizeBillingInput(
    {
      holderName: 'RENAN GUADALUPE',
      number: '4111 1111 1111 1111',
      expiryMonth: '8',
      expiryYear: '30',
      ccv: '123',
    },
    {
      name: 'Renan Guadalupe',
      email: 'RENAN@EXAMPLE.COM ',
      cpfCnpj: '123.456.789-01',
      postalCode: '12243-000',
      addressNumber: '123',
      addressComplement: 'Apto 10',
      mobilePhone: '(12) 99767-3260',
    },
  )

  assert.deepEqual(result.errors, {})
  assert.deepEqual(result.creditCard, {
    holderName: 'RENAN GUADALUPE',
    number: '4111111111111111',
    expiryMonth: '08',
    expiryYear: '2030',
    ccv: '123',
  })
  assert.deepEqual(result.creditCardHolderInfo, {
    name: 'Renan Guadalupe',
    email: 'renan@example.com',
    cpfCnpj: '12345678901',
    postalCode: '12243000',
    addressNumber: '123',
    addressComplement: 'Apto 10',
    mobilePhone: '12997673260',
  })
})

test('returns exact field-level errors instead of one generic card error', () => {
  const result = validateAndNormalizeBillingInput(
    {
      holderName: 'R',
      number: '1234',
      expiryMonth: '19',
      expiryYear: '2',
      ccv: '1',
    },
    {
      name: 'R',
      email: 'sem-arroba',
      cpfCnpj: '123',
      postalCode: '12',
      addressNumber: '',
      mobilePhone: '1',
    },
  )

  assert.equal(result.creditCard, null)
  assert.equal(result.creditCardHolderInfo, null)
  assert.equal(result.errors.cardHolderName, 'Nome impresso no cartão deve ter pelo menos 3 caracteres.')
  assert.equal(result.errors.cardNumber, 'Número do cartão deve ter entre 13 e 19 dígitos.')
  assert.equal(result.errors.expiryMonth, 'Mês do vencimento inválido. Use um valor de 01 a 12.')
  assert.equal(result.errors.expiryYear, 'Ano do vencimento inválido. Use 2 ou 4 dígitos, por exemplo 30 ou 2030.')
  assert.equal(result.errors.ccv, 'CVV deve ter 3 ou 4 dígitos.')
  assert.equal(result.errors.holderEmail, 'E-mail do titular inválido.')
  assert.equal(result.errors.holderTaxId, 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos.')
  assert.equal(result.errors.postalCode, 'CEP deve ter 8 dígitos.')
  assert.equal(result.errors.addressNumber, 'Informe o número do endereço.')
})
