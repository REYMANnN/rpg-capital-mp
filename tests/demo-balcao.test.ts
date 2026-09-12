import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEMO_STORAGE_KEY,
  createDemoFinanceDashboard,
  createDemoStoreData,
} from '../lib/demo/balcao'

test('demo seed has realistic inventory and historical operations', () => {
  const store = createDemoStoreData()
  assert.ok(DEMO_STORAGE_KEY.includes('demo'))
  assert.ok(store.products.length >= 12)
  assert.ok(store.sales.length >= 20)
  assert.ok(store.movements.length >= store.sales.length)
})

test('demo seed includes the two scanner showcase EANs', () => {
  const store = createDemoStoreData()
  const barcodes = new Set(store.products.map((product) => product.barcode))
  assert.equal(barcodes.has('7891000100103'), true)
  assert.equal(barcodes.has('7891022638004'), true)
})

test('all demo sales and movements reference products that exist', () => {
  const store = createDemoStoreData()
  const productIds = new Set(store.products.map((product) => product.id))

  for (const sale of store.sales) {
    assert.ok(sale.items.length > 0)
    for (const item of sale.items) assert.equal(productIds.has(item.productId), true)
  }

  for (const movement of store.movements) {
    assert.equal(productIds.has(movement.productId), true)
  }
})

test('demo finance dashboard is populated from mock banking and inventory data', () => {
  const store = createDemoStoreData()
  const dashboard = createDemoFinanceDashboard(30, store)

  assert.equal(dashboard.previewMode, true)
  assert.ok(dashboard.accounts.length > 0)
  assert.ok(dashboard.transactions.length > 0)
  assert.ok(dashboard.summary.bankBalanceCents > 0)
  assert.ok(dashboard.summary.salesCents > 0)
  assert.ok(dashboard.summary.inventoryValueCents > 0)
  assert.ok(dashboard.recentSales.length > 0)
})

test('each demo seed is an independent object graph', () => {
  const first = createDemoStoreData()
  const second = createDemoStoreData()
  const originalSecondStock = second.products[0].stockMilli

  first.products[0].stockMilli = 0
  first.sales.splice(0, 1)

  assert.equal(second.products[0].stockMilli, originalSecondStock)
  assert.notEqual(first.sales.length, second.sales.length)
})
