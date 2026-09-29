import assert from 'node:assert/strict'
import test from 'node:test'

import { formatRafaHistory, type RafaEventRow } from '../lib/rafa-events-core.ts'
import { isValidGtin, rafaOperationRisks, validateRafaChangesStrict } from '../lib/rafa-ops-core.ts'

const product = (over: Record<string, unknown> = {}) => ({
  id: 'p1', name: 'Coca-Cola 2L', barcode: '7894900027013', priceCents: 1000, stockMilli: 5000,
  averageCostCents: 700, minStockMilli: 0, unit: 'UN', deletedAt: null, ...over,
})
const state = (products: unknown[]) => ({ products, sales: [], movements: [] }) as never

test('EAN com dígito verificador', () => {
  assert.equal(isValidGtin('7894900027013'), true)
  assert.equal(isValidGtin('7894900027014'), false)
  assert.equal(isValidGtin('123'), false)
})

test('validação bloqueia produto de outra loja, preço absurdo e EAN repetido', () => {
  const s = state([product()])
  assert.match(String(validateRafaChangesStrict(s, [{ kind: 'preco', productId: 'x', expectedPriceCents: 1, newPriceCents: 100 } as never])), /não encontrado/)
  assert.match(String(validateRafaChangesStrict(s, [{ kind: 'preco', productId: 'p1', expectedPriceCents: 1000, newPriceCents: 999_999_999 } as never])), /inválido/)
  assert.match(String(validateRafaChangesStrict(s, [{ kind: 'cadastrar', productId: 'n', barcode: '7894900027013', name: 'Dup', priceCents: 100, costCents: 50, stockMilli: 0 } as never])), /Já existe/)
  assert.equal(validateRafaChangesStrict(s, [{ kind: 'preco', productId: 'p1', expectedPriceCents: 1000, newPriceCents: 1200 } as never]), null)
  assert.match(String(validateRafaChangesStrict(s, [])), /Nenhuma/)
})

test('riscos: abaixo do custo, remover e lote grande pedem confirmação', () => {
  const s = state([product()])
  assert.equal(rafaOperationRisks(s, [{ kind: 'preco', productId: 'p1', expectedPriceCents: 1000, newPriceCents: 1200 } as never]).length, 0)
  assert.match(rafaOperationRisks(s, [{ kind: 'preco', productId: 'p1', expectedPriceCents: 1000, newPriceCents: 500 } as never])[0], /abaixo do custo/)
  assert.match(rafaOperationRisks(s, [{ kind: 'remover', productId: 'p1', expectedStockMilli: 5000 } as never])[0], /remover/)
  const many = Array.from({ length: 21 }, () => ({ kind: 'preco', productId: 'p1', expectedPriceCents: 1000, newPriceCents: 1100 }))
  assert.match(rafaOperationRisks(s, many as never)[0], /21 alterações/)
})

test('histórico mantém as mensagens mais novas quando passa do limite', () => {
  const events: RafaEventRow[] = Array.from({ length: 50 }, (_, index) => ({
    id: `id${String(index).padStart(6, '0')}`, direction: index % 2 ? 'out' : 'in', kind: 'text',
    text: `mensagem ${index} ${'x'.repeat(80)}`, data: null, media_path: null, created_at: new Date(Date.UTC(2026, 8, 29, 12, index)).toISOString(),
  }))
  const text = formatRafaHistory(events, 1500)
  assert.match(text, /mensagem 49/)
  assert.doesNotMatch(text, /mensagem 0 /)
  assert.match(text, /omitidas/)
  assert.match(formatRafaHistory([]), /nenhuma mensagem/)
})

test('foto aparece com id curto para a IA poder referenciar', () => {
  const text = formatRafaHistory([{ id: 'abcdef1234567890', direction: 'in', kind: 'image', text: 'nota do atacadão', data: null, media_path: 'x.jpg', created_at: new Date().toISOString() }])
  assert.match(text, /\[foto abcdef12\]: nota do atacadão/)
})
