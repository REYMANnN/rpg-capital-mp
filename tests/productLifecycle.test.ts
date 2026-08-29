import test from 'node:test'
import assert from 'node:assert/strict'
import { activeProducts, reactivateProduct, softDeleteProduct } from '../lib/inventory/productLifecycle'

const product = {
  id: 'p1',
  barcode: '7891000376843',
  name: 'Bono Chocolate 90g',
  priceCents: 399,
  stockMilli: 12000,
  minStockMilli: 2000,
  unit: 'UN' as const,
  averageCostCents: 230,
}

test('soft delete removes stock without destroying product identity', () => {
  const result = softDeleteProduct(product, '2026-08-29T16:30:00.000Z')
  assert.equal(result.product.deletedAt, '2026-08-29T16:30:00.000Z')
  assert.equal(result.product.stockMilli, 0)
  assert.equal(result.stockAdjustmentMilli, -12000)
  assert.equal(result.product.id, product.id)
  assert.equal(result.product.barcode, product.barcode)
})

test('deleted products are hidden from active inventory', () => {
  const deleted = softDeleteProduct(product, '2026-08-29T16:30:00.000Z').product
  assert.deepEqual(activeProducts([deleted, { ...product, id: 'p2', barcode: '7894900011517' }]).map((p) => p.id), ['p2'])
})

test('reactivating the same product keeps identity and starts from zero stock', () => {
  const deleted = softDeleteProduct(product, '2026-08-29T16:30:00.000Z').product
  const restored = reactivateProduct(deleted)
  assert.equal(restored.id, product.id)
  assert.equal(restored.barcode, product.barcode)
  assert.equal(restored.stockMilli, 0)
  assert.equal(restored.deletedAt, undefined)
})
