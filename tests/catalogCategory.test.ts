import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyGeneralCategory } from '../lib/inventory/catalog/category'

test('maps broad retail categories deterministically', () => {
  assert.equal(classifyGeneralCategory('smartphones electronics mobile phones'), 'Eletrônicos')
  assert.equal(classifyGeneralCategory('biscoito recheado chocolate food snacks'), 'Alimentos e bebidas')
  assert.equal(classifyGeneralCategory('shampoo hair care beauty'), 'Higiene e beleza')
  assert.equal(classifyGeneralCategory('detergente limpeza household cleaning'), 'Limpeza')
  assert.equal(classifyGeneralCategory('camiseta apparel clothing'), 'Vestuário')
  assert.equal(classifyGeneralCategory('medicamento pharmacy health'), 'Saúde')
  assert.equal(classifyGeneralCategory('ração cachorro pet food'), 'Pet')
})

test('category classification never blocks unknown products', () => {
  assert.equal(classifyGeneralCategory(''), 'Não classificado')
  assert.equal(classifyGeneralCategory(undefined, 'categoria totalmente desconhecida'), 'Não classificado')
})
