import assert from 'node:assert/strict'
import test from 'node:test'

import { buildInvoicePlan, internalBarcodeFor, sameProductName } from '../lib/rafa-invoice-plan.ts'

const state = {
  products: [
    { id: 'coca', name: 'Refrigerante Coca-Cola Original 2L', barcode: '7894900027013', priceCents: 1199, stockMilli: 10_000, averageCostCents: 700, minStockMilli: 0, deletedAt: null },
    { id: 'ketchup', name: 'Ketchup Heinz 1,033kg', barcode: '7896102000122', priceCents: 2199, stockMilli: 1000, averageCostCents: 1500, minStockMilli: 0, deletedAt: null },
  ],
  sales: [], movements: [],
} as never

const line = (description: string, extra: Record<string, unknown> = {}) => ({ description, quantity: 12, unit_cost_cents: 500, total_cents: 6000, confidence: { product: 0.95, quantity: 0.95, cost: 0.95 }, resolution: { status: 'unresolved', candidates: [] }, ...extra }) as never

test('toda linha vira entrada ou produto novo; nenhuma "dúvida" inventada', () => {
  const plan = buildInvoicePlan(state, [
    line('COCA COLA ORIGINAL PET 2L', { resolution: { status: 'resolved', candidate: { id: 'coca', barcode: '7894900027013', name: 'Refrigerante Coca-Cola Original 2L' } } }),
    line('GUARANA ANTARCTICA PET 2L', { confidence: { product: 0.95, quantity: 0.95, cost: 0.7 }, unit_cost_cents: 769 }),
    line('PEPSI COLA PET 2L', { missing: 'nao_encontrado' }),
    line('AGUA SANITARIA QBOA 1L', { missing: 'sem_marca' }),
    line('ARROZ TIO JOAO T1 5KG', { missing: 'tamanho', check_reasons: ['valor_nao_confere'] }),
  ], { lenient: true })
  assert.equal(plan.duvidas.length, 0)
  assert.equal(plan.entradas.length, 1)
  assert.equal(plan.novos.length, 4)
  assert.equal(plan.novos.find((row) => /Guarana/i.test(row.name))?.costCents, 769)
})

test('custo que faltou é calculado pelo total da linha', () => {
  const plan = buildInvoicePlan(state, [line('FEIJAO CAMIL 1KG', { unit_cost_cents: null, total_cents: 14900, quantity: 20 })], { lenient: true })
  assert.equal(plan.novos[0].costCents, 745)
})

test('nome errado do catálogo não é aceito (Italac não vira Moça)', () => {
  assert.equal(sameProductName('LEITE ITALAC INTEGRAL UHT 1L', 'Leite Condensado Integral moça'), false)
  assert.equal(sameProductName('SABONETE DOVE ORIGINAL 90G', 'Sabonete Dove Original Skin Care Beauty Bar 90g'), true)
  const plan = buildInvoicePlan(state, [line('LEITE ITALAC INTEGRAL UHT 1L', { resolution: { status: 'new', candidate: { barcode: '7891000100103', name: 'Leite Condensado Integral moça' } } })], { lenient: true })
  assert.notEqual(plan.novos[0].barcode, '7891000100103')
  assert.match(plan.novos[0].name, /Italac/i)
})

test('código interno é estável e válido; próxima nota com o mesmo nome vira entrada', () => {
  const code = internalBarcodeFor('PEPSI COLA PET 2L')
  assert.equal(code, internalBarcodeFor('pepsi cola pet 2l'))
  assert.match(code, /^04\d{11}$/)
  const withPepsi = { ...(state as any), products: [...(state as any).products, { id: 'pepsi', name: 'Pepsi Cola Pet 2l', barcode: code, priceCents: 900, stockMilli: 0, averageCostCents: 500, minStockMilli: 0, deletedAt: null }] } as never
  const plan = buildInvoicePlan(withPepsi, [line('PEPSI COLA PET 2L')], { lenient: true })
  assert.equal(plan.entradas[0]?.productId, 'pepsi')
})

test('código interno passa na validação de EAN usada no cadastro', async () => {
  const { isValidGtin } = await import('../lib/rafa-ops-core.ts')
  for (const name of ['PEPSI COLA PET 2L', 'AGUA SANITARIA QBOA 1L', 'x', 'FEIJAO CAMIL CARIOCA T1 1KG']) assert.equal(isValidGtin(internalBarcodeFor(name)), true, name)
})

test('código interno passa na validação de EAN usada no cadastro', async () => {
  const { isValidGtin } = await import('../lib/rafa-ops-core.ts')
  for (const name of ['PEPSI COLA PET 2L', 'AGUA SANITARIA QBOA 1L', 'x', 'FEIJAO CAMIL CARIOCA T1 1KG']) assert.equal(isValidGtin(internalBarcodeFor(name)), true, name)
})

test('não confunde feijão com arroz nem ketchup 397g com 1,033kg', async () => {
  const { plausibleStoreMatch } = await import('../lib/rafa-invoice-plan.ts')
  assert.equal(plausibleStoreMatch('FEIJAO CAMIL CARIOCA T1 1KG', 'Arroz Camil Tipo 1 1kg'), false)
  assert.equal(plausibleStoreMatch('KETCHUP HEINZ TRAD 397G', 'Ketchup Heinz 1,033kg'), false)
  assert.equal(plausibleStoreMatch('COCA COLA ORIGINAL PET 2L', 'Refrigerante Coca-Cola Original 2L'), true)
  assert.equal(plausibleStoreMatch('ACUCAR UNIAO REFINADO 1KG', 'Açúcar Refinado União 1kg'), true)
  assert.equal(plausibleStoreMatch('OLEO SOJA LIZA PET 900ML', 'Óleo de Soja Liza 900ml'), true)
  assert.equal(plausibleStoreMatch('LEITE COND MOCA TP 395G', 'Leite Condensado Moça 395g'), true)
})
