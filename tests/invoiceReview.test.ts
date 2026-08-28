import assert from 'node:assert/strict'
import test from 'node:test'
import { editInvoiceReviewLine, importableInvoiceLines, type InvoiceReviewLineV10 } from '../lib/inventory/invoiceReview.ts'

const line: InvoiceReviewLineV10 = {
  line: 1,
  supplierCode: 'ABC',
  barcode: '7894900011517',
  description: 'REFRI COCACOLA2L',
  quantityMilli: 6000,
  unitCostCents: 720,
  totalCents: 4320,
  name: 'Coca-Cola Original 2L',
  brand: 'Coca-Cola',
  imageUrl: '',
  source: 'EAN',
  resolution: 'ean',
  confirmed: true,
  selected: true,
}

test('editing quantity or unit cost recalculates purchase line total', () => {
  const edited = editInvoiceReviewLine(line, { quantityMilli: 12000, unitCostCents: 700 })
  assert.equal(edited.totalCents, 8400)
  assert.equal(edited.barcode, line.barcode)
})

test('only confirmed, selected and identified lines are importable', () => {
  const unresolved = { ...line, line: 2, confirmed: false }
  const unchecked = { ...line, line: 3, selected: false }
  const noBarcode = { ...line, line: 4, barcode: '' }
  assert.deepEqual(importableInvoiceLines([line, unresolved, unchecked, noBarcode]).map((item) => item.line), [1])
})
