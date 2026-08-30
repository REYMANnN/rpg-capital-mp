import test from 'node:test'
import assert from 'node:assert/strict'

test('maps a ViaCEP JSON payload to the BALCÃO address shape', async () => {
  let mod: typeof import('../../lib/accounts/cep') | null = null
  try {
    mod = await import('../../lib/accounts/cep')
  } catch {
    assert.fail('CEP helper module does not exist yet')
  }

  assert.equal(mod.normalizeCep('12.244-038'), '12244038')
  assert.equal(mod.normalizeCep('abc'), '')
  assert.deepEqual(mod.mapViaCepResponse({
    cep: '01001-000',
    logradouro: 'Praça da Sé',
    bairro: 'Sé',
    localidade: 'São Paulo',
    uf: 'SP',
  }), {
    street: 'Praça da Sé',
    neighborhood: 'Sé',
    city: 'São Paulo',
    state: 'SP',
  })
})

test('rejects ViaCEP not-found and incomplete responses', async () => {
  let mod: typeof import('../../lib/accounts/cep') | null = null
  try {
    mod = await import('../../lib/accounts/cep')
  } catch {
    assert.fail('CEP helper module does not exist yet')
  }

  assert.equal(mod.mapViaCepResponse({ erro: true }), null)
  assert.equal(mod.mapViaCepResponse({ logradouro: '', bairro: '', localidade: '', uf: '' }), null)
})
