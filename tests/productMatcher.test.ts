import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeProductName, scoreProductCandidate, pickBestProductCandidate } from '../lib/inventory/productMatcher.ts'

test('normalizes abbreviations, punctuation and units without an LLM', () => {
  assert.equal(normalizeProductName('REFRI COCACOLA2L'), 'refrigerante coca cola 2 l')
  assert.equal(normalizeProductName('LEITE COND. MOCA 395GR'), 'leite condensado moca 395 g')
})

test('scores same brand/product/size much higher than a different variant', () => {
  const exact = scoreProductCandidate('REFRI COCACOLA2L', 'Coca-Cola Original 2 litros')
  const wrong = scoreProductCandidate('REFRI COCACOLA2L', 'Coca-Cola Original 600 ml')
  assert.ok(exact >= 0.78, `expected strong score, got ${exact}`)
  assert.ok(exact > wrong + 0.2, `expected size mismatch penalty: ${exact} vs ${wrong}`)
})

test('returns best candidate only when confidence and lead are sufficient', () => {
  const result = pickBestProductCandidate('REFRI COCACOLA2L', [
    { barcode: '7894900011517', name: 'Coca-Cola Original 2 litros', brand: 'Coca-Cola', imageUrl: '' },
    { barcode: '7894900011005', name: 'Coca-Cola Original 600 ml', brand: 'Coca-Cola', imageUrl: '' },
  ])
  assert.equal(result?.candidate.barcode, '7894900011517')
  assert.ok((result?.score ?? 0) >= 0.78)
})

test('does not force a guess when candidates are weak', () => {
  const result = pickBestProductCandidate('BISC CHOC 90G', [
    { barcode: '7894900011517', name: 'Coca-Cola Original 2 litros', brand: 'Coca-Cola', imageUrl: '' },
  ])
  assert.equal(result, null)
})
