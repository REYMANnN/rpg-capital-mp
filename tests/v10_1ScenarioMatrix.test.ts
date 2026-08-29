import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveInvoiceLine } from '../lib/inventory/invoiceResolver.ts'
import type { ParsedNfeItem } from '../lib/inventory/nfe.ts'

const base = (patch: Partial<ParsedNfeItem> = {}): ParsedNfeItem => ({
  line: 1,
  supplierCode: 'SKU',
  barcode: '',
  description: 'REFRI COCACOLA2L',
  purchaseUnit: 'UN',
  quantityMilli: 1000,
  unitCostCents: 700,
  totalCents: 700,
  ...patch,
})

const localPriced = { id: 'p1', barcode: '7894900011517', name: 'Coca-Cola Original 2L', brand: 'Coca-Cola', priceCents: 1200, unit: 'UN' as const, local: true }
const localUnpriced = { ...localPriced, id: 'p2', priceCents: 0 }

test('v10.1 matrix separates identity, local commercial state and pending decisions', () => {
  const cases = [
    {
      name: 'EAN existing priced',
      result: resolveInvoiceLine({ item: base({ barcode: localPriced.barcode }), localProducts: [localPriced], catalogCandidates: [] }),
      expected: ['ean', 'existing-priced', 'resolved'],
    },
    {
      name: 'EAN existing unpriced',
      result: resolveInvoiceLine({ item: base({ barcode: localUnpriced.barcode }), localProducts: [localUnpriced], catalogCandidates: [] }),
      expected: ['ean', 'existing-unpriced', 'resolved'],
    },
    {
      name: 'EAN new store',
      result: resolveInvoiceLine({ item: base({ barcode: '7891000100103' }), localProducts: [], catalogCandidates: [{ barcode: '7891000100103', name: 'Leite Condensado Moça 395g' }] }),
      expected: ['ean', 'new', 'resolved'],
    },
    {
      name: 'known supplier alias',
      result: resolveInvoiceLine({ item: base(), localProducts: [localPriced], catalogCandidates: [], alias: { barcode: localPriced.barcode, canonicalName: localPriced.name, purchaseUnit: 'UN', packageFactor: 1 } }),
      expected: ['alias', 'existing-priced', 'resolved'],
    },
    {
      name: 'name suggestion',
      result: resolveInvoiceLine({ item: base(), localProducts: [localPriced], catalogCandidates: [] }),
      expected: ['suggested', 'existing-priced', 'needs-identity'],
    },
    {
      name: 'unresolved',
      result: resolveInvoiceLine({ item: base({ description: 'ITEM COMPLETAMENTE DESCONHECIDO 123' }), localProducts: [], catalogCandidates: [] }),
      expected: ['unresolved', 'new', 'needs-identity'],
    },
    {
      name: 'alias conflict',
      result: resolveInvoiceLine({ item: base({ barcode: '7891000100103' }), localProducts: [], catalogCandidates: [{ barcode: '7891000100103', name: 'Leite Condensado Moça 395g' }], alias: { barcode: localPriced.barcode, canonicalName: localPriced.name, purchaseUnit: 'UN', packageFactor: 1 } }),
      expected: ['conflict', 'new', 'needs-identity'],
    },
    {
      name: 'package unknown factor',
      result: resolveInvoiceLine({ item: base({ barcode: localPriced.barcode, purchaseUnit: 'CX' }), localProducts: [localPriced], catalogCandidates: [] }),
      expected: ['ean', 'existing-priced', 'needs-package-factor'],
    },
    {
      name: 'package known factor',
      result: resolveInvoiceLine({ item: base({ purchaseUnit: 'CX', quantityMilli: 2000, unitCostCents: 4200 }), localProducts: [localPriced], catalogCandidates: [], alias: { barcode: localPriced.barcode, canonicalName: localPriced.name, purchaseUnit: 'CX', packageFactor: 6 } }),
      expected: ['alias', 'existing-priced', 'resolved'],
      stockQuantityMilli: 12000,
      inventoryUnitCostCents: 700,
    },
  ] as const

  for (const scenario of cases) {
    assert.deepEqual(
      [scenario.result.identityStatus, scenario.result.storeStatus, scenario.result.decisionState],
      scenario.expected,
      scenario.name,
    )
    if ('stockQuantityMilli' in scenario) assert.equal(scenario.result.stockQuantityMilli, scenario.stockQuantityMilli, scenario.name)
    if ('inventoryUnitCostCents' in scenario) assert.equal(scenario.result.inventoryUnitCostCents, scenario.inventoryUnitCostCents, scenario.name)
  }
})
