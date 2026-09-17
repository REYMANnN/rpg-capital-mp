import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyWhatsAppText, normalizeWhatsAppText } from '../lib/whatsapp-router.ts'

test('normalizes trim, case, accents and repeated spaces', () => {
  assert.equal(normalizeWhatsAppText('  QUANTO   VENDÍ   Ontem  '), 'quanto vendi ontem')
})

const cases: Array<[string, string]> = [
  ['saldo', 'consulta'],
  ['saldo hoje', 'consulta'],
  ['quanto vendi ontem', 'consulta'],
  ['Vendi 2 coca 15', 'registrar_venda'],
  ['vendinha boa hoje', 'desconhecida'],
  ['7891000100103', 'produto_por_ean'],
  ['7891000100104', 'desconhecida'],
  ['PARAR', 'opt_out'],
  ['parar de verdade', 'desconhecida'],
]

for (const [input, intent] of cases) {
  test(`${JSON.stringify(input)} -> ${intent}`, () => {
    assert.equal(classifyWhatsAppText(input).intent, intent)
  })
}

test('classifies command exactly before prefixes', () => {
  assert.equal(classifyWhatsAppText('  VÓLTAR  ').intent, 'opt_in')
})

test('classifies all requested consultation prefixes', () => {
  for (const input of ['caixa de hoje', 'quanto entrou hoje', 'vendas de ontem', 'fechamento do dia']) {
    assert.equal(classifyWhatsAppText(input).intent, 'consulta')
  }
})

test('classifies all requested sale prefixes with whole-word boundaries', () => {
  for (const input of ['venda 3 agua', 'vendeu 1 cafe']) {
    assert.equal(classifyWhatsAppText(input).intent, 'registrar_venda')
  }
  assert.equal(classifyWhatsAppText('vendeuTudo').intent, 'desconhecida')
})

test('classifies all requested stock-entry prefixes with whole-word boundaries', () => {
  for (const input of ['entrou 4 leite', 'comprei 2 caixas', 'chegou coca', 'entrada 10 unidades']) {
    assert.equal(classifyWhatsAppText(input).intent, 'entrada_estoque')
  }
  assert.equal(classifyWhatsAppText('entradax').intent, 'desconhecida')
})

test('accepts valid GTIN lengths 8, 12, 13 and 14 and rejects unsupported lengths', () => {
  for (const input of ['96385074', '036000291452', '7891000100103', '00012345600012']) {
    assert.equal(classifyWhatsAppText(input).intent, 'produto_por_ean', input)
  }
  assert.equal(classifyWhatsAppText('1234567').intent, 'desconhecida')
})
