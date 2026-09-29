import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatWelcomePhone,
  welcomeConfirmationMessage,
  welcomeDecision,
  welcomeStockMessage,
  welcomeTutorialMessage,
} from '../lib/rafa-welcome.ts'

test('formata telefone brasileiro na boas-vindas', () => {
  assert.equal(formatWelcomePhone('5512997672260'), '(12) 99767-2260')
})

test('monta confirmação, tutorial e estoque', () => {
  const confirmation = welcomeConfirmationMessage('5512997672260', 'Mercadinho São João')
  assert.match(confirmation, /\(12\) 99767-2260/)
  assert.match(confirmation, /Mercadinho São João/)
  const tutorial = welcomeTutorialMessage('João')
  assert.match(tutorial, /Perfeito, João!/)
  assert.match(tutorial, /Vender/)
  assert.match(tutorial, /Nota de mercadoria/)
  const stock = welcomeStockMessage()
  assert.match(stock, /montar seu estoque/)
  assert.match(stock, /notas antigas/)
})

test('regra de necessidade de boas-vindas', () => {
  const one = [{ id: '1', name: 'Loja A' }]
  const two = [{ id: '1', name: 'Loja A' }, { id: '2', name: 'Loja B' }]
  assert.equal(welcomeDecision(null, one), 'confirm')
  assert.equal(welcomeDecision(null, two), 'select')
  assert.equal(welcomeDecision('2026-10-01T10:00:00Z', one), 'normal')
  assert.equal(welcomeDecision(null, []), 'none')
})
