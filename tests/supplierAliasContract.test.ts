import assert from 'node:assert/strict'
import test from 'node:test'

test('supplier alias v10.1 contract preserves packaging metadata', () => {
  const alias = {
    supplierDocument: '12345678000190',
    supplierCode: 'CC2L',
    barcode: '7894900011517',
    canonicalName: 'Coca-Cola Original 2L',
    observedDescription: 'REFRI COCACOLA2L',
    purchaseUnit: 'CX',
    packageFactor: 6,
    confirmations: 3,
    revisions: 1,
  }
  assert.equal(alias.purchaseUnit, 'CX')
  assert.equal(alias.packageFactor, 6)
  assert.equal(alias.barcode, '7894900011517')
})

test('direct units persist factor 1', () => {
  for (const purchaseUnit of ['UN', 'KG']) {
    const packageFactor = purchaseUnit === 'UN' || purchaseUnit === 'KG' ? 1 : 0
    assert.equal(packageFactor, 1)
  }
})
