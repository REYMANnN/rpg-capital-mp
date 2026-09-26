import assert from 'node:assert/strict'
import test from 'node:test'

import { buildInvoicePlan, invoicePlanMessage, pendingProductsBlock, priceRequestMessage } from '../../lib/rafa-invoice-plan.ts'
import { inventoryFacts, pickDailyTip, SOLD_WITHOUT_STOCK_NOTE } from '../../lib/rafa-tips.ts'
import { applyRafaChanges } from '../../lib/inventory/rafa-store.ts'
import { isNfeXml } from '../../lib/rafa-files.ts'

const now = new Date('2026-09-27T12:00:00-03:00').getTime()
const iso = (daysAgo: number) => new Date(now - daysAgo * 86400_000).toISOString()

const state = {
  products: [
    { id: 'p1', barcode: '7894900011517', name: 'Coca-Cola 2L', priceCents: 1199, averageCostCents: 780, stockMilli: 4000, minStockMilli: 0 },
    { id: 'p2', barcode: '7896006713012', name: 'Arroz Camil 5kg', priceCents: 2990, averageCostCents: 0, stockMilli: 1000, minStockMilli: 0 },
  ],
  sales: [],
  movements: [],
} as never

const sure = { product: 1, quantity: 1, cost: 1 }

test('nota: conhecido vira entrada, novo espera preço, resto é dúvida', () => {
  const plan = buildInvoicePlan(state, [
    { description: 'COCA COLA 2L', quantity: 6, unit_cost_cents: 800, confidence: sure, resolution: { status: 'resolved', candidate: { id: 'p1', barcode: '7894900011517', name: 'Coca-Cola 2L', source: 'store_ean' } } },
    { description: 'COCA COLA 2L', quantity: 6, unit_cost_cents: 820, confidence: sure, resolution: { status: 'resolved', candidate: { id: 'p1', barcode: '7894900011517', name: 'Coca-Cola 2L', source: 'store_ean' } } },
    { description: 'FEIJAO KICALDO 1KG', quantity: 10, unit_cost_cents: 650, confidence: sure, resolution: { status: 'new', candidate: { barcode: '7891000100103', name: 'Feijão Kicaldo Carioca 1kg', source: 'catalog' } } },
    { description: 'OLEO ??', quantity: 3, unit_cost_cents: 700, confidence: sure, resolution: { status: 'unresolved', candidates: [] } },
    { description: 'SABAO', quantity: 2, unit_cost_cents: 500, confidence: { product: 1, quantity: 0.4, cost: 1 }, resolution: { status: 'resolved', candidate: { id: 'p1', barcode: '7894900011517', name: 'x', source: 'store_ean' } } },
  ])
  assert.equal(plan.entradas.length, 1)
  assert.equal(plan.entradas[0].quantityMilli, 12000)
  assert.equal(plan.entradas[0].unitCostCents, 810)
  assert.equal(plan.novos.length, 1)
  assert.deepEqual({ ...plan.novos[0], brand: undefined }, { barcode: '7891000100103', name: 'Feijão Kicaldo Carioca 1kg', brand: undefined, quantityMilli: 10000, costCents: 650 })
  assert.deepEqual(plan.duvidas.map((doubt) => doubt.reason), ['não achei o produto', 'não li a quantidade'])
  const message = invoicePlanMessage(plan, 'Atacadão', 'https://x/l/abc')
  assert.match(message, /Li a nota de Atacadão: 4 produto/)
  assert.match(message, /Confirma a entrada dos 1\?/)
  assert.match(message, /https:\/\/x\/l\/abc/)
})

test('pedido de preço e bloco do agente nunca trazem preço de venda sugerido', () => {
  const rows = [{ barcode: '7891000100103', name: 'Feijão Kicaldo 1kg', quantity_milli: 10000, cost_cents: 650 }]
  const ask = priceRequestMessage(rows)
  assert.match(ask, /1\. Feijão Kicaldo 1kg — custo R\$\s?6,50 · 10 un\./)
  assert.match(pendingProductsBlock(rows), /1 \| Feijão Kicaldo 1kg \| 7891000100103/)
  assert.match(pendingProductsBlock(rows), /Nunca sugira nem invente preço de venda/)
})

test('venda sem estoque registrado não trava e fica marcada', () => {
  const { state: after } = applyRafaChanges(state, [{ kind: 'venda', productId: 'p2', expectedStockMilli: 1000, quantityMilli: 3000 }], { waId: '5511' })
  const product = after.products.find((item) => item.id === 'p2')!
  assert.equal(product.stockMilli, 0)
  const adjustment = after.movements.find((movement) => movement.type === 'adjustment')!
  assert.equal(adjustment.quantityMilli, 2000)
  assert.ok(adjustment.note.startsWith(SOLD_WITHOUT_STOCK_NOTE))
})

test('dica do dia: prioridade e conselhos', () => {
  assert.equal(pickDailyTip(inventoryFacts(state, 3, now))?.key, 'pending_prices')
  assert.equal(pickDailyTip(inventoryFacts({ products: [], sales: [], movements: [] } as never, 0, now))?.key, 'first_invoice')
  const sold = {
    ...(state as any),
    sales: [{ id: 's', createdAt: iso(1), totalCents: 0, cogsCents: 0, grossProfitCents: 0, items: [] }],
    movements: [
      { id: 'm1', productId: 'p2', type: 'adjustment', quantityMilli: 2000, createdAt: iso(1), note: `${SOLD_WITHOUT_STOCK_NOTE} (caixa)` },
      { id: 'm2', productId: 'p2', type: 'sale', quantityMilli: -3000, createdAt: iso(1), note: 'Venda' },
    ],
  }
  const facts = inventoryFacts(sold, 0, now)
  assert.deepEqual(facts.soldWithoutStock, ['Arroz Camil 5kg'])
  assert.deepEqual(facts.withoutCost, ['Arroz Camil 5kg'])
  assert.equal(pickDailyTip(facts)?.key, 'sold_without_stock')
  const calm = { ...(state as any), sales: [{ id: 's', createdAt: iso(1), totalCents: 0, cogsCents: 0, grossProfitCents: 0, items: [] }], movements: [] }
  assert.equal(pickDailyTip(inventoryFacts(calm, 0, now))?.key, 'no_invoice_week')
})

test('reconhece XML de NF-e', () => {
  assert.equal(isNfeXml('<nfeProc><NFe><infNFe Id="x"><det nItem="1"><prod></prod></det></infNFe></NFe></nfeProc>'), true)
  assert.equal(isNfeXml('<lista><item/></lista>'), false)
})
