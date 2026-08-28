import assert from 'node:assert/strict'
import test from 'node:test'
import { validateNewProductCommercialData, validateSalePrice } from '../lib/inventory/productRules.ts'

test('new unit-scan product requires sale price and purchase cost', () => {
  assert.equal(validateNewProductCommercialData(0, 500), 'Informe o preço de venda.')
  assert.equal(validateNewProductCommercialData(900, 0), 'Informe o custo de compra.')
  assert.equal(validateNewProductCommercialData(900, 500), '')
})

test('product with pending sale price cannot be sold', () => {
  assert.equal(validateSalePrice(0), 'Defina o preço de venda antes de vender este produto.')
  assert.equal(validateSalePrice(799), '')
})
