import assert from 'node:assert/strict'
import test from 'node:test'

import { belowCostWarning, parsePriceAnswer, priceQuestion, registeredMessage } from '../../lib/rafa-price-flow.ts'
import { searchTerms } from '../../lib/rafa-name-ean.ts'

test('respostas de preço do lojista (texto e áudio transcrito)', () => {
  assert.deepEqual(parsePriceAnswer('11,99'), { kind: 'price', cents: 1199 })
  assert.deepEqual(parsePriceAnswer('R$ 11,99'), { kind: 'price', cents: 1199 })
  assert.deepEqual(parsePriceAnswer('vendo a 11.99'), { kind: 'price', cents: 1199 })
  assert.deepEqual(parsePriceAnswer('12'), { kind: 'price', cents: 1200 })
  assert.deepEqual(parsePriceAnswer('5'), { kind: 'price', cents: 500 })
  assert.deepEqual(parsePriceAnswer('11 e 99'), { kind: 'price', cents: 1199 })
  assert.deepEqual(parsePriceAnswer('11 reais e 90 centavos'), { kind: 'price', cents: 1190 })
  assert.deepEqual(parsePriceAnswer('R$ 1.250,00'), { kind: 'price', cents: 125000 })
  assert.deepEqual(parsePriceAnswer('Pula'), { kind: 'skip' })
  assert.deepEqual(parsePriceAnswer('para'), { kind: 'stop' })
  assert.deepEqual(parsePriceAnswer('continuar preços'), { kind: 'resume' })
  // Outra conversa não é preço: vai para a IA.
  assert.equal(parsePriceAnswer('quanto vendi hoje?'), null)
  assert.equal(parsePriceAnswer('coca 11,99 e arroz 27,90'), null)
  assert.equal(parsePriceAnswer('é a lata de 350'), null)
})

test('pergunta, aviso de custo e confirmação', () => {
  const row = { name: 'Refrigerante Coca-Cola PET 2L', cost_cents: 749, quantity_milli: 6000, unit: 'UN' }
  const first = priceQuestion(row, 3, { total: 3 })
  assert.match(first, /Achei 3 produto\(s\) novo\(s\)/)
  assert.match(first, /Faltam 3 · Refrigerante Coca-Cola PET 2L/)
  assert.match(first, /Custo: R\$\s?7,49 · chegaram 6 un\./)
  assert.match(priceQuestion(row, 1), /^Último · /)
  assert.match(belowCostWarning(row, 699), /abaixo do custo/)
  assert.match(registeredMessage({ ...row, unit: 'KG', quantity_milli: 2500 }, 3290), /R\$\s?32,90 o kg, 2,5 kg no estoque/)
})

test('termos de busca a partir da descrição abreviada', () => {
  assert.equal(searchTerms('REFRIG COCA COLA PET 2L'), 'refrigerante coca cola pet 2l')
  assert.equal(searchTerms('PAP HIG NEVE C/12 30M'), 'papel higienico neve 30m')
})
