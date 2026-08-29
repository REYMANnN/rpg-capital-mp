import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveInvoiceLine } from '../lib/inventory/invoiceResolver.ts'
import type { ParsedNfeItem } from '../lib/inventory/nfe.ts'

const item = (patch: Partial<ParsedNfeItem> = {}): ParsedNfeItem => ({
  line: 1,
  supplierCode: 'SKU-1',
  barcode: '',
  description: 'REFRI COCACOLA2L',
  purchaseUnit: 'UN',
  quantityMilli: 6000,
  unitCostCents: 720,
  totalCents: 4320,
  ...patch,
})

const cocaLocal = { id: 'local-coca', barcode: '7894900011517', name: 'Coca-Cola Original 2L', brand: 'Coca-Cola', priceCents: 1200, unit: 'UN' as const, local: true }
const cocaGlobal = { barcode: '7894900011517', name: 'Refrigerante Coca-Cola 2Lt', brand: 'Coca-Cola', priceCents: 0, unit: 'UN' as const }

test('explicit EAN already in store is resolved and keeps commercial status separate', () => {
  const result = resolveInvoiceLine({ item: item({ barcode: cocaLocal.barcode }), localProducts: [cocaLocal], catalogCandidates: [] })
  assert.equal(result.identityStatus, 'ean')
  assert.equal(result.storeStatus, 'existing-priced')
  assert.equal(result.decisionState, 'resolved')
  assert.equal(result.productId, 'local-coca')
})

test('explicit EAN with local product lacking sale price is identified without identity question', () => {
  const result = resolveInvoiceLine({ item: item({ barcode: cocaLocal.barcode }), localProducts: [{ ...cocaLocal, priceCents: 0 }], catalogCandidates: [] })
  assert.equal(result.identityStatus, 'ean')
  assert.equal(result.storeStatus, 'existing-unpriced')
  assert.equal(result.decisionState, 'resolved')
})

test('new explicit EAN is resolved but marked new in this store', () => {
  const result = resolveInvoiceLine({ item: item({ barcode: cocaGlobal.barcode }), localProducts: [], catalogCandidates: [cocaGlobal] })
  assert.equal(result.identityStatus, 'ean')
  assert.equal(result.storeStatus, 'new')
  assert.equal(result.decisionState, 'resolved')
})

test('known supplier alias resolves without asking when there is no explicit EAN', () => {
  const result = resolveInvoiceLine({
    item: item(), localProducts: [cocaLocal], catalogCandidates: [],
    alias: { barcode: cocaLocal.barcode, canonicalName: cocaLocal.name, purchaseUnit: 'UN', packageFactor: 1 },
  })
  assert.equal(result.identityStatus, 'alias')
  assert.equal(result.decisionState, 'resolved')
  assert.equal(result.barcode, cocaLocal.barcode)
})

test('local product wins deterministic name suggestion over similar global catalog result', () => {
  const result = resolveInvoiceLine({ item: item(), localProducts: [cocaLocal], catalogCandidates: [cocaGlobal] })
  assert.equal(result.identityStatus, 'suggested')
  assert.equal(result.decisionState, 'needs-identity')
  assert.equal(result.productId, 'local-coca')
  assert.equal(result.source.includes('mercado'), true)
})

test('ambiguous or unrelated product remains unresolved', () => {
  const result = resolveInvoiceLine({
    item: item({ description: 'BISC CHOC 90G TESTE' }), localProducts: [],
    catalogCandidates: [{ barcode: '11111111', name: 'Arroz 5kg' }, { barcode: '22222222', name: 'Feijão 1kg' }],
  })
  assert.equal(result.identityStatus, 'unresolved')
  assert.equal(result.decisionState, 'needs-identity')
})

test('explicit EAN conflicting with historical supplier alias blocks review', () => {
  const result = resolveInvoiceLine({
    item: item({ barcode: '7891000100103' }), localProducts: [],
    catalogCandidates: [{ barcode: '7891000100103', name: 'Leite Condensado Moça 395g' }],
    alias: { barcode: cocaLocal.barcode, canonicalName: cocaLocal.name, purchaseUnit: 'UN', packageFactor: 1 },
  })
  assert.equal(result.identityStatus, 'conflict')
  assert.equal(result.decisionState, 'needs-identity')
  assert.equal(result.barcode, '7891000100103')
  assert.equal(result.conflictingAliasBarcode, cocaLocal.barcode)
})

test('package unit with missing factor blocks review after identity is known', () => {
  const result = resolveInvoiceLine({ item: item({ barcode: cocaLocal.barcode, purchaseUnit: 'CX' }), localProducts: [cocaLocal], catalogCandidates: [] })
  assert.equal(result.identityStatus, 'ean')
  assert.equal(result.decisionState, 'needs-package-factor')
})

test('package unit reuses known factor from supplier alias', () => {
  const result = resolveInvoiceLine({
    item: item({ purchaseUnit: 'CX' }), localProducts: [cocaLocal], catalogCandidates: [],
    alias: { barcode: cocaLocal.barcode, canonicalName: cocaLocal.name, purchaseUnit: 'CX', packageFactor: 6 },
  })
  assert.equal(result.decisionState, 'resolved')
  assert.equal(result.packageFactor, 6)
  assert.equal(result.stockQuantityMilli, 36000)
  assert.equal(result.inventoryUnitCostCents, 120)
})
