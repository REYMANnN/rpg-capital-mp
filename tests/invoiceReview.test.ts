import assert from 'node:assert/strict'
import test from 'node:test'
import {
  editInvoiceReviewLine,
  importableInvoiceLines,
  pendingInvoiceLines,
  recalculateInvoiceLine,
  requiresPackageFactor,
  type InvoiceReviewLineV10,
} from '../lib/inventory/invoiceReview.ts'

const line: InvoiceReviewLineV10 = {
  line: 1,
  supplierCode: 'ABC',
  barcode: '7894900011517',
  description: 'REFRI COCACOLA2L',
  purchaseUnit: 'UN',
  quantityMilli: 6000,
  unitCostCents: 720,
  totalCents: 4320,
  name: 'Coca-Cola Original 2L',
  brand: 'Coca-Cola',
  imageUrl: '',
  source: 'EAN',
  resolution: 'ean',
  identityStatus: 'ean',
  storeStatus: 'existing-priced',
  decisionState: 'resolved',
  confirmed: true,
  selected: true,
  packageFactor: 1,
  stockQuantityMilli: 6000,
  inventoryUnitCostCents: 720,
  salePriceCents: 1200,
  inventoryUnit: 'UN',
}

test('editing quantity or unit cost recalculates purchase line total and stock math', () => {
  const edited = editInvoiceReviewLine(line, { quantityMilli: 12000, unitCostCents: 700 })
  assert.equal(edited.totalCents, 8400)
  assert.equal(edited.stockQuantityMilli, 12000)
  assert.equal(edited.inventoryUnitCostCents, 700)
})

test('package conversion maps purchase packs to stock units and per-unit cost', () => {
  const box = recalculateInvoiceLine({ ...line, purchaseUnit: 'CX', quantityMilli: 6000, unitCostCents: 6000, packageFactor: 6 })
  assert.equal(box.stockQuantityMilli, 36000)
  assert.equal(box.inventoryUnitCostCents, 1000)
  assert.equal(box.totalCents, 36000)
  assert.equal(box.inventoryUnit, 'UN')
})

test('package units require a factor while UN and KG do not', () => {
  assert.equal(requiresPackageFactor('CX'), true)
  assert.equal(requiresPackageFactor('FD'), true)
  assert.equal(requiresPackageFactor('PCT'), true)
  assert.equal(requiresPackageFactor('UN'), false)
  assert.equal(requiresPackageFactor('KG'), false)
})

test('only selected resolved identified lines are importable; excluded lines are not pending', () => {
  const pending = { ...line, line: 2, decisionState: 'needs-identity' as const, confirmed: false }
  const unchecked = { ...line, line: 3, selected: false }
  const excluded = { ...line, line: 4, barcode: '', selected: false, decisionState: 'excluded' as const, resolution: 'unresolved' as const }
  assert.deepEqual(importableInvoiceLines([line, pending, unchecked, excluded]).map((item) => item.line), [1])
  assert.deepEqual(pendingInvoiceLines([line, pending, unchecked, excluded]).map((item) => item.line), [2])
})
