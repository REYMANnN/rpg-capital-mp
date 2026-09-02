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
      { id: 't2', accountId: 'a1', postedAt: '2026-08-30T12:00:00Z', amountCents: -40000, description: 'Fornecedor', category: 'Fornecedores', source: 'mock' as const },
      { id: 't3', accountId: 'a1', postedAt: '2026-08-29T12:00:00Z', amountCents: -10000, description: 'Energia', category: 'Energia', source: 'mock' as const },
      { id: 't4', accountId: 'a1', postedAt: '2026-08-28T12:00:00Z', amountCents: -25000, description: 'Transferência própria', category: 'Transferência', isInternalTransfer: true, source: 'mock' as const },
      { id: 't5', accountId: 'a2', postedAt: '2026-08-28T12:01:00Z', amountCents: 25000, description: 'Transferência própria', category: 'Transferência', isInternalTransfer: true, source: 'mock' as const },
    ],
    dailyMetrics: [
      { metricDate: '2026-08-30', salesCents: 100000, cogsCents: 60000, unitsSoldMilli: 12000, source: 'mock' as const },
      { metricDate: '2026-08-31', salesCents: 50000, cogsCents: 20000, unitsSoldMilli: 7000, source: 'mock' as const },
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
    { category: 'Fornecedores', amountCents: 40000 },
    { category: 'Energia', amountCents: 10000 },
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
