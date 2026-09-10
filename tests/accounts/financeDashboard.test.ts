import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFinanceDashboard } from '../../lib/finance/dashboard'

const now = new Date('2026-09-01T18:00:00.000Z')

function baseInput() {
  return {
    days: 30 as const,
    now,
    accounts: [
      { id: 'a1', institutionName: 'Banco A', balanceCents: 120000, source: 'mock' as const },
      { id: 'a2', institutionName: 'Banco B', balanceCents: 80000, source: 'mock' as const },
    ],
    transactions: [
      { id: 't1', accountId: 'a1', postedAt: '2026-08-31T12:00:00Z', amountCents: 100000, description: 'Recebimentos', category: 'Vendas', source: 'mock' as const },
      { id: 't2', accountId: 'a1', postedAt: '2026-08-30T12:00:00Z', amountCents: -40000, description: 'Fornecedor', counterpartyName: 'Distribuidora ABC', category: 'Fornecedores', source: 'mock' as const },
      { id: 't3', accountId: 'a1', postedAt: '2026-08-29T12:00:00Z', amountCents: -10000, description: 'Energia', counterpartyName: 'Companhia de Energia', category: 'Energia', source: 'mock' as const },
      { id: 't4', accountId: 'a1', postedAt: '2026-08-28T12:00:00Z', amountCents: -25000, description: 'Transferência própria', category: 'Transferência', isInternalTransfer: true, source: 'mock' as const },
      { id: 't5', accountId: 'a2', postedAt: '2026-08-28T12:01:00Z', amountCents: 25000, description: 'Transferência própria', category: 'Transferência', isInternalTransfer: true, source: 'mock' as const },
      { id: 'p1', accountId: 'a1', postedAt: '2026-07-31T12:00:00Z', amountCents: 60000, description: 'Recebimentos anteriores', category: 'Vendas', source: 'mock' as const },
      { id: 'p2', accountId: 'a1', postedAt: '2026-07-30T12:00:00Z', amountCents: -30000, description: 'Fornecedor anterior', counterpartyName: 'Distribuidora ABC', category: 'Fornecedores', source: 'mock' as const },
    ],
    dailyMetrics: [
      { metricDate: '2026-08-30', salesCents: 100000, cogsCents: 60000, unitsSoldMilli: 12000, source: 'mock' as const },
      { metricDate: '2026-08-31', salesCents: 50000, cogsCents: 20000, unitsSoldMilli: 7000, source: 'mock' as const },
      { metricDate: '2026-07-31', salesCents: 80000, cogsCents: 50000, unitsSoldMilli: 9000, source: 'mock' as const },
    ],
    inventoryState: {
      products: [
        { id: 'p1', stockMilli: 10000, averageCostCents: 500 },
        { id: 'p2', stockMilli: 5000, averageCostCents: 1000 },
      ],
      sales: [],
    },
  }
}

test('dashboard keeps bank movement separate from sales and excludes internal transfers', () => {
  const dashboard = buildFinanceDashboard(baseInput())

  assert.equal(dashboard.summary.bankBalanceCents, 200000)
  assert.equal(dashboard.summary.bankInflowsCents, 100000)
  assert.equal(dashboard.summary.bankOutflowsCents, 50000)
  assert.equal(dashboard.summary.netCashFlowCents, 50000)
  assert.equal(dashboard.summary.salesCents, 150000)
})

test('dashboard calculates weighted gross margin from revenue and COGS', () => {
  const dashboard = buildFinanceDashboard(baseInput())

  assert.equal(dashboard.summary.cogsCents, 80000)
  assert.equal(dashboard.summary.grossProfitCents, 70000)
  assert.equal(dashboard.summary.grossMarginBps, 4667)
  assert.equal(dashboard.summary.marginEstimated, false)
})

test('dashboard exposes non-zero daily sales, COGS, gross profit and margin for charting', () => {
  const dashboard = buildFinanceDashboard(baseInput())
  const aug30 = dashboard.salesFlow.find((day) => day.date === '2026-08-30')

  assert.ok(aug30)
  assert.equal(aug30.salesCents, 100000)
  assert.equal(aug30.cogsCents, 60000)
  assert.equal(aug30.grossProfitCents, 40000)
  assert.equal(aug30.grossMarginBps, 4000)
})

test('dashboard reconstructs consolidated balance trend and daily net cash flow', () => {
  const dashboard = buildFinanceDashboard(baseInput())

  assert.equal(dashboard.cashFlow.at(-1)?.balanceCents, 200000)
  assert.equal(dashboard.cashFlow.find((day) => day.date === '2026-08-31')?.netCents, 100000)
  assert.equal(dashboard.cashFlow.find((day) => day.date === '2026-08-30')?.netCents, -40000)
})

test('dashboard compares the current period with the immediately previous period', () => {
  const dashboard = buildFinanceDashboard(baseInput())

  assert.equal(dashboard.comparison.available, true)
  assert.equal(dashboard.comparison.previous.salesCents, 80000)
  assert.equal(dashboard.comparison.previous.netCashFlowCents, 30000)
  assert.equal(dashboard.comparison.changes.salesPct, 87.5)
  assert.equal(dashboard.comparison.changes.grossProfitPct, 133.33)
})

test('dashboard ranks outgoing counterparties for accountant drill-down', () => {
  const dashboard = buildFinanceDashboard(baseInput())

  assert.deepEqual(dashboard.topCounterparties.slice(0, 2), [
    { name: 'Distribuidora ABC', category: 'Fornecedores', amountCents: 40000, transactionCount: 1 },
    { name: 'Companhia de Energia', category: 'Energia', amountCents: 10000, transactionCount: 1 },
  ])
})

test('dashboard values inventory at cost and estimates inventory days from period COGS', () => {
  const dashboard = buildFinanceDashboard(baseInput())

  // p1 = R$50 at cost, p2 = R$50 at cost.
  assert.equal(dashboard.summary.inventoryValueCents, 10000)
  // R$800 COGS / 30 days = R$26.67/day; R$100 inventory ~= 3.75 days.
  assert.equal(dashboard.summary.inventoryDays, 3.75)
})

test('dashboard groups expense categories without counting internal transfers', () => {
  const dashboard = buildFinanceDashboard(baseInput())

  assert.deepEqual(dashboard.expenseCategories, [
    { category: 'Fornecedores', amountCents: 40000, shareBps: 8000, transactionCount: 1 },
    { category: 'Energia', amountCents: 10000, shareBps: 2000, transactionCount: 1 },
  ])
})

test('dashboard marks historical margin as estimated when an old sale has no cost snapshot', () => {
  const input = baseInput()
  input.dailyMetrics = []
  input.inventoryState = {
    products: [{ id: 'p1', stockMilli: 1000, averageCostCents: 300 }],
    sales: [{
      id: 's1',
      createdAt: '2026-08-31T10:00:00Z',
      totalCents: 1000,
      items: [{ productId: 'p1', quantityMilli: 1000, unitPriceCents: 1000, lineTotalCents: 1000 }],
    }],
  }

  const dashboard = buildFinanceDashboard(input)
  assert.equal(dashboard.summary.salesCents, 1000)
  assert.equal(dashboard.summary.cogsCents, 300)
  assert.equal(dashboard.summary.grossProfitCents, 700)
  assert.equal(dashboard.summary.marginEstimated, true)
})

test('dashboard separates card, Pix, cash and legacy sales by checkout payment method', () => {
  const input = baseInput()
  input.dailyMetrics = []
  input.inventoryState = {
    products: [{ id: 'p1', stockMilli: 1000, averageCostCents: 600 }],
    sales: [
      { id: 'card-1', createdAt: '2026-08-30T10:00:00Z', totalCents: 10000, cogsCents: 6000, grossProfitCents: 4000, items: [], payment: { method: 'card', confirmedAt: '2026-08-30T10:00:00Z' } },
      { id: 'pix-1', createdAt: '2026-08-30T11:00:00Z', totalCents: 5000, cogsCents: 2000, grossProfitCents: 3000, items: [], payment: { method: 'pix', confirmedAt: '2026-08-30T11:00:00Z' } },
      { id: 'cash-1', createdAt: '2026-08-31T10:00:00Z', totalCents: 3000, cogsCents: 1000, grossProfitCents: 2000, items: [], payment: { method: 'cash', confirmedAt: '2026-08-31T10:00:00Z' } },
      { id: 'legacy-1', createdAt: '2026-08-31T11:00:00Z', totalCents: 2000, cogsCents: 1000, grossProfitCents: 1000, items: [] },
    ],
  } as any

  const dashboard = buildFinanceDashboard(input as any)

  assert.equal(dashboard.paymentSummary.cardSalesCents, 10000)
  assert.equal(dashboard.paymentSummary.pixSalesCents, 5000)
  assert.equal(dashboard.paymentSummary.cashSalesCents, 3000)
  assert.equal(dashboard.paymentSummary.legacySalesCents, 2000)
  assert.equal(dashboard.card.grossCardSalesCents, 10000)
  assert.equal(dashboard.card.pendingGrossCents, 10000)
  assert.equal(dashboard.recentSales.length, 4)
  assert.equal(dashboard.recentSales[0].id, 'legacy-1')
})

test('recognized Getnet settlement reconciles conservatively without becoming a second sale or profit', () => {
  const input = baseInput()
  input.dailyMetrics = []
  input.transactions = [
    { id: 'getnet-1', accountId: 'a1', postedAt: '2026-08-31T18:00:00Z', amountCents: 9700, description: 'CREDITO GETNET', counterpartyName: 'Getnet', category: 'Recebimentos', source: 'malvo' as const },
    { id: 'customer-1', accountId: 'a1', postedAt: '2026-08-31T19:00:00Z', amountCents: 5000, description: 'PIX CLIENTE', counterpartyName: 'Cliente comum', category: 'Recebimentos', source: 'malvo' as const },
  ]
  input.inventoryState = {
    products: [],
    sales: [
      { id: 'card-30', createdAt: '2026-08-30T12:00:00Z', totalCents: 10000, cogsCents: 6000, grossProfitCents: 4000, items: [], payment: { method: 'card', confirmedAt: '2026-08-30T12:00:00Z' } },
      { id: 'card-31', createdAt: '2026-08-31T20:00:00Z', totalCents: 5000, cogsCents: 3000, grossProfitCents: 2000, items: [], payment: { method: 'card', confirmedAt: '2026-08-31T20:00:00Z' } },
    ],
  } as any

  const dashboard = buildFinanceDashboard(input as any)

  assert.equal(dashboard.summary.salesCents, 15000)
  assert.equal(dashboard.summary.grossProfitCents, 6000)
  assert.equal(dashboard.card.grossCardSalesCents, 15000)
  assert.equal(dashboard.card.recognizedSettlementCents, 9700)
  assert.equal(dashboard.card.reconciledGrossCents, 10000)
  assert.equal(dashboard.card.reconciledSettlementCents, 9700)
  assert.equal(dashboard.card.estimatedFeeCents, 300)
  assert.equal(dashboard.card.estimatedFeeRateBps, 300)
  assert.equal(dashboard.card.pendingGrossCents, 5000)
  assert.equal(dashboard.card.settlements.length, 1)
  assert.equal(dashboard.card.settlements[0].provider, 'Getnet')
  assert.equal(dashboard.card.settlements[0].status, 'reconciled')
})

test('unknown bank inflow is not classified as a card settlement', () => {
  const input = baseInput()
  input.dailyMetrics = []
  input.transactions = [
    { id: 'unknown-1', accountId: 'a1', postedAt: '2026-08-31T18:00:00Z', amountCents: 9700, description: 'TED RECEBIDA', counterpartyName: 'Cliente XYZ', category: 'Recebimentos', source: 'malvo' as const },
  ]
  input.inventoryState = {
    products: [],
    sales: [
      { id: 'card-30', createdAt: '2026-08-30T12:00:00Z', totalCents: 10000, cogsCents: 6000, grossProfitCents: 4000, items: [], payment: { method: 'card', confirmedAt: '2026-08-30T12:00:00Z' } },
    ],
  } as any

  const dashboard = buildFinanceDashboard(input as any)
  assert.equal(dashboard.card.recognizedSettlementCents, 0)
  assert.equal(dashboard.card.reconciledGrossCents, 0)
  assert.equal(dashboard.card.pendingGrossCents, 10000)
  assert.equal(dashboard.card.estimatedFeeRateBps, null)
})