// Confere os corpos e caminhos que mandamos pra SumUp contra a especificação OpenAPI oficial
// e testa a assinatura do state do OAuth e da URL do webhook.
// Rodar: node --experimental-strip-types --test tests/sumup-contract.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  decodeStateWith,
  encodeStateWith,
  merchantCodeFromMe,
  merchantCodeFromMemberships,
  normalizePairingCode,
  pairReaderBody,
  readerCheckoutBody,
  signWith,
  SUMUP_PATHS,
  verifyWith,
} from '../lib/sumup/core.ts'

const SPEC_URL = 'https://raw.githubusercontent.com/sumup/sumup-openapi/refs/heads/main/openapi.json'

type Schema = Record<string, any>
let spec: Schema

async function loadSpec() {
  if (spec) return spec
  const response = await fetch(SPEC_URL)
  assert.ok(response.ok, `não baixou a especificação (${response.status})`)
  spec = await response.json() as Schema
  return spec
}

function resolve(schema: Schema): Schema {
  if (schema?.$ref) return resolve(schema.$ref.split('/').slice(1).reduce((node: Schema, key: string) => node[key], spec))
  return schema
}

// Validador mínimo de JSON Schema para os campos que usamos.
function validate(value: unknown, raw: Schema, path = '$'): string[] {
  const schema = resolve(raw)
  const errors: string[] = []
  if (schema.allOf) for (const part of schema.allOf) errors.push(...validate(value, part, path))
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} fora do enum ${JSON.stringify(schema.enum)}`)
  const type = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []
  if (type.includes('integer') && !Number.isInteger(value)) errors.push(`${path}: deveria ser inteiro`)
  if (type.includes('string') && typeof value !== 'string') errors.push(`${path}: deveria ser texto`)
  if (type.includes('string') && typeof value === 'string' && schema.maxLength && value.length > schema.maxLength) errors.push(`${path}: texto maior que ${schema.maxLength}`)
  if (type.includes('string') && typeof value === 'string' && schema.minLength && value.length < schema.minLength) errors.push(`${path}: texto menor que ${schema.minLength}`)
  if ((type.includes('integer') || type.includes('number')) && typeof value === 'number' && schema.minimum != null && value < schema.minimum) errors.push(`${path}: menor que ${schema.minimum}`)
  if (schema.properties && value && typeof value === 'object') {
    for (const key of schema.required || []) if (!(key in (value as object))) errors.push(`${path}.${key}: obrigatório e ausente`)
    for (const [key, child] of Object.entries(value as object)) {
      if (!schema.properties[key]) errors.push(`${path}.${key}: campo que a SumUp não conhece`)
      else errors.push(...validate(child, schema.properties[key], `${path}.${key}`))
    }
  }
  return errors
}

function requestSchema(path: string, method: string) {
  const op = spec.paths[path]?.[method]
  assert.ok(op, `${method.toUpperCase()} ${path} não existe na especificação`)
  return op.requestBody.content['application/json'].schema
}

test('cobrança na Solo: corpo bate com CreateReaderCheckoutRequest (crédito parcelado e débito)', async () => {
  await loadSpec()
  const schema = requestSchema('/v0.1/merchants/{merchant_code}/readers/{reader_id}/checkout', 'post')
  const base = { amountCents: 3550, description: 'Venda RPG', returnUrl: 'https://www.rpgcapital.com.br/api/sumup/solo-webhook?c=x&s=y', foreignTransactionId: '2b0b0f3e-8a5e-4a4d-9d0f-0f0f0f0f0f0f' }
  const credit = readerCheckoutBody({ ...base, cardType: 'credito', installments: 3, affiliate: { key: 'k', app_id: 'com.rpgcapital.rafa' } })
  const debit = readerCheckoutBody({ ...base, cardType: 'debito', installments: 5, affiliate: null })
  assert.deepEqual(validate(credit, schema), [])
  assert.deepEqual(validate(debit, schema), [])
  assert.equal(credit.card_type, 'credit')
  assert.equal(credit.installments, 3)
  assert.equal(debit.card_type, 'debit')
  assert.equal('installments' in debit, false, 'débito não pode mandar parcelas')
  assert.equal(credit.total_amount.value, 3550)
  assert.equal(readerCheckoutBody({ ...base, cardType: 'credito', installments: 40, affiliate: null }).installments, 12, 'teto de 12x')
})

test('controle negativo: o validador pega corpo errado', async () => {
  await loadSpec()
  const schema = requestSchema('/v0.1/merchants/{merchant_code}/readers/{reader_id}/checkout', 'post')
  const errors = validate({ total_amount: { currency: 'BRL', minor_unit: 2, value: 1.5 }, card_type: 'credito', parcelas: 2 }, schema)
  assert.ok(errors.some((error) => error.includes('card_type')), 'não pegou enum errado')
  assert.ok(errors.some((error) => error.includes('parcelas')), 'não pegou campo desconhecido')
  assert.ok(errors.some((error) => error.includes('inteiro')), 'não pegou valor não inteiro')
})

test('parear Solo: corpo bate com o POST de readers e código é normalizado', async () => {
  await loadSpec()
  const schema = requestSchema('/v0.1/merchants/{merchant_code}/readers', 'post')
  const code = normalizePairingCode(' ab12-cd34 ')
  assert.equal(code, 'AB12CD34')
  assert.deepEqual(validate(pairReaderBody(code!, 'Caixa 1'), schema), [])
  assert.equal(normalizePairingCode('123'), null)
})

test('caminhos usados existem na especificação com o método certo', async () => {
  await loadSpec()
  const template = (path: string) => path.replace('MCODE', '{merchant_code}').replace('RID', '{reader_id}').split('?')[0]
  const used: Array<[string, string]> = [
    [template(SUMUP_PATHS.memberships), 'get'],
    [template(SUMUP_PATHS.readers('MCODE')), 'post'],
    [template(SUMUP_PATHS.checkout('MCODE', 'RID')), 'post'],
    [template(SUMUP_PATHS.terminate('MCODE', 'RID')), 'post'],
    [template(SUMUP_PATHS.transaction('MCODE', 'x')), 'get'],
  ]
  for (const [path, method] of used) assert.ok(spec.paths[path]?.[method], `${method.toUpperCase()} ${path} não existe`)
  const params = spec.paths['/v2.1/merchants/{merchant_code}/transactions'].get.parameters.map((param: Schema) => resolve(param).name)
  assert.ok(params.includes('client_transaction_id'), 'busca por client_transaction_id não existe')
})

test('merchant code: /me decide; memberships só sem ambiguidade', () => {
  assert.equal(merchantCodeFromMe({ merchant_profile: { merchant_code: 'MND9NEHV' } }), 'MND9NEHV')
  assert.equal(merchantCodeFromMe({}), null)
  assert.equal(merchantCodeFromMemberships({ items: [{ type: 'organization', resource_id: 'O1', status: 'accepted' }, { type: 'merchant', resource_id: 'MZ0ZWGY7', status: 'accepted' }] }), 'MZ0ZWGY7')
  assert.equal(merchantCodeFromMemberships({ items: [{ type: 'merchant', resource_id: 'MZ0ZWGY7', status: 'accepted' }, { type: 'merchant', resource_id: 'MND9NEHV', status: 'accepted' }] }), null, 'conta real + sandbox é ambíguo')
  assert.equal(merchantCodeFromMemberships({ items: [{ type: 'merchant', resource_id: 'M2', status: 'disabled' }] }), null)
  assert.equal(merchantCodeFromMemberships(null), null)
})

test('state do OAuth e assinatura do webhook: válido passa, adulterado e vencido não', () => {
  const secret = 'x'.repeat(40)
  const state = encodeStateWith(secret, { storeId: 's1', userId: 'u1', next: '/manage' })
  assert.equal(decodeStateWith(secret, state)?.storeId, 's1')
  const [payload, signature] = state.split('.')
  const forged = Buffer.from(JSON.stringify({ storeId: 'outra', userId: 'u1', next: '/', exp: Date.now() + 60_000, nonce: 'n' })).toString('base64url')
  assert.equal(decodeStateWith(secret, `${forged}.${signature}`), null, 'aceitou state adulterado')
  assert.equal(decodeStateWith('y'.repeat(40), state), null, 'aceitou outro segredo')
  assert.equal(decodeStateWith(secret, state, Date.now() + 16 * 60_000), null, 'aceitou state vencido')
  assert.ok(payload)
  const sig = signWith(secret, 'solo:abc')
  assert.ok(verifyWith(secret, 'solo:abc', sig))
  assert.equal(verifyWith(secret, 'solo:abd', sig), false)
  assert.throws(() => signWith('curto', 'x'))
})
