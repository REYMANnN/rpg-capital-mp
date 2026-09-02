import test from 'node:test'
import assert from 'node:assert/strict'
import { completeSale } from '../../lib/inventory/core'

test('sale snapshots unit cost, COGS and gross profit at checkout time', () => {
  const products = [{
    id: 'p1',
    barcode: '7890000000001',
    name: 'Produto teste',
    priceCents: 1000,
    averageCostCents: 600,
    stockMilli: 10000,
    minStockMilli: 1000,
  }] as any

  const result = completeSale(products, [{ productId: 'p1', quantityMilli: 3000 }], 'sale-1') as any

  assert.equal(result.sale.totalCents, 3000)
  assert.equal(result.sale.items[0].unitCostCents, 600)
  assert.equal(result.sale.items[0].lineCostCents, 1800)
  assert.equal(result.sale.cogsCents, 1800)
  assert.equal(result.sale.grossProfitCents, 1200)
})

test('sale cost snapshot is not affected by later product cost changes', () => {
  const products = [{
    id: 'p1',
    barcode: '7890000000001',
    name: 'Produto teste',
    priceCents: 1000,
    averageCostCents: 400,
    stockMilli: 10000,
    minStockMilli: 1000,
  }] as any

  const result = completeSale(products, [{ productId: 'p1', quantityMilli: 2000 }], 'sale-2') as any
  products[0].averageCostCents = 900

  assert.equal(result.sale.items[0].unitCostCents, 400)
  assert.equal(result.sale.cogsCents, 800)
  assert.equal(result.sale.grossProfitCents, 1200)
})
