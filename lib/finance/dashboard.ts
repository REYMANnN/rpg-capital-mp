export type FinanceSource = 'mock' | 'malvo' | 'manual'
export type MetricSource = 'mock' | 'derived'

export type FinanceAccountInput = {
  id: string
  institutionName: string
  accountName?: string | null
  accountType?: string | null
  maskedNumber?: string | null
  balanceCents: number
  currency?: string | null
  status?: string | null
  source: FinanceSource
  lastSyncedAt?: string | null
}

export type FinanceTransactionInput = {
  id: string
  accountId: string
  postedAt: string
  amountCents: number
  description: string
  counterpartyName?: string | null
  counterpartyTaxId?: string | null
  category?: string | null
  categoryConfidence?: number | null
  transactionType?: string | null
  isInternalTransfer?: boolean
  source: FinanceSource
}

export type FinanceDailyMetricInput = {
  metricDate: string
  salesCents: number
  cogsCents: number
  unitsSoldMilli?: number
  source: MetricSource
}

type InventoryProductInput = {
  id: string
  stockMilli: number
  averageCostCents?: number | null
  archivedAt?: string | null
}

type InventorySaleItemInput = {
  productId: string
  quantityMilli: number
  unitPriceCents?: number
  lineTotalCents?: number
  unitCostCents?: number
  lineCostCents?: number
}

type InventorySaleInput = {
  id: string
  createdAt: string
  totalCents: number
  cogsCents?: number
  grossProfitCents?: number
  items?: InventorySaleItemInput[]
}

export type FinanceInventoryState = {
  products: InventoryProductInput[]
  sales: InventorySaleInput[]
}

export type FinanceDashboardInput = {
  days: 7 | 30 | 90
  now?: Date
  accounts: FinanceAccountInput[]
  transactions: FinanceTransactionInput[]
  dailyMetrics: FinanceDailyMetricInput[]
  inventoryState: FinanceInventoryState
}

export type FinanceDashboard = ReturnType<typeof buildFinanceDashboard>

function cents(value: unknown) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return Math.round(number)
}

function dateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function dayStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function shiftDays(value: Date, delta: number) {
  const date = new Date(value)
  date.setUTCDate(date.getUTCDate() + delta)
  return date
}

function periodStart(now: Date, days: number) {
  return shiftDays(dayStart(now), -(days - 1))
}

function dayKeys(start: Date, days: number) {
  return Array.from({ length: days }, (_, index) => dateKey(shiftDays(start, index)))
}

function inPeriod(value: string, startKey: string, endKey: string) {
  const key = dateKey(value)
  return Boolean(key && key >= startKey && key <= endKey)
}

function roundPct(value: number) {
  return Math.round(value * 100) / 100
}

function percentageChange(current: number, previous: number) {
  if (!previous) return null
  return roundPct((current - previous) * 100 / Math.abs(previous))
}

function deriveSales(
  state: FinanceInventoryState,
  startKey: string,
  endKey: string,
) {
  const costByProduct = new Map(
    state.products.map((product) => [product.id, cents(product.averageCostCents)]),
  )
  const daily = new Map<string, { salesCents: number; cogsCents: number }>()
  let salesCents = 0
  let cogsCents = 0
  let marginEstimated = false

  for (const sale of state.sales) {
    if (!inPeriod(sale.createdAt, startKey, endKey)) continue
    const saleRevenue = cents(sale.totalCents)
    let saleCogs: number

    if (typeof sale.cogsCents === 'number' && Number.isFinite(sale.cogsCents)) {
      saleCogs = cents(sale.cogsCents)
    } else {
      saleCogs = (sale.items ?? []).reduce((sum, item) => {
        if (typeof item.lineCostCents === 'number' && Number.isFinite(item.lineCostCents)) {
          return sum + cents(item.lineCostCents)
        }
        marginEstimated = true
        const unitCost = typeof item.unitCostCents === 'number'
          ? cents(item.unitCostCents)
          : costByProduct.get(item.productId) ?? 0
        return sum + Math.round(unitCost * cents(item.quantityMilli) / 1000)
      }, 0)
    }

    salesCents += saleRevenue
    cogsCents += saleCogs
    const key = dateKey(sale.createdAt)
    const existing = daily.get(key) ?? { salesCents: 0, cogsCents: 0 }
    existing.salesCents += saleRevenue
    existing.cogsCents += saleCogs
    daily.set(key, existing)
  }

  return { salesCents, cogsCents, marginEstimated, daily }
}

function summarizeSales(
  metrics: FinanceDailyMetricInput[],
  inventoryState: FinanceInventoryState,
  startKey: string,
  endKey: string,
) {
  const metricRows = metrics.filter((metric) => {
    const key = metric.metricDate.slice(0, 10)
    return key >= startKey && key <= endKey
  })
  const derived = deriveSales(inventoryState, startKey, endKey)
  const useMetrics = metricRows.length > 0
  const salesCents = useMetrics
    ? metricRows.reduce((sum, metric) => sum + cents(metric.salesCents), 0)
    : derived.salesCents
  const cogsCents = useMetrics
    ? metricRows.reduce((sum, metric) => sum + cents(metric.cogsCents), 0)
    : derived.cogsCents
  const grossProfitCents = salesCents - cogsCents
  const grossMarginBps = salesCents > 0 ? Math.round(grossProfitCents * 10_000 / salesCents) : null

  return {
    metricRows,
    derived,
    useMetrics,
    salesCents,
    cogsCents,
    grossProfitCents,
    grossMarginBps,
    marginEstimated: useMetrics ? false : derived.marginEstimated,
  }
}

function summarizeBank(
  transactions: FinanceTransactionInput[],
  startKey: string,
  endKey: string,
) {
  const periodTransactions = transactions
    .filter((transaction) => inPeriod(transaction.postedAt, startKey, endKey))
    .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
  const operational = periodTransactions.filter((transaction) => !transaction.isInternalTransfer)
  const inflowsCents = operational
    .filter((transaction) => transaction.amountCents > 0)
    .reduce((sum, transaction) => sum + cents(transaction.amountCents), 0)
  const outflowsCents = operational
    .filter((transaction) => transaction.amountCents < 0)
    .reduce((sum, transaction) => sum + Math.abs(cents(transaction.amountCents)), 0)

  return {
    periodTransactions,
    operational,
    inflowsCents,
    outflowsCents,
    netCashFlowCents: inflowsCents - outflowsCents,
  }
}

export function buildFinanceDashboard(input: FinanceDashboardInput) {
  const now = input.now ?? new Date()
  const start = periodStart(now, input.days)
  const startKey = dateKey(start)
  const endKey = dateKey(now)
  const previousEnd = shiftDays(start, -1)
  const previousStart = shiftDays(previousEnd, -(input.days - 1))
  const previousStartKey = dateKey(previousStart)
  const previousEndKey = dateKey(previousEnd)
  const keys = dayKeys(start, input.days)

  const accounts = input.accounts.map((account) => ({
    id: account.id,
    institutionName: account.institutionName,
    accountName: account.accountName ?? null,
    accountType: account.accountType ?? null,
    maskedNumber: account.maskedNumber ?? null,
    balanceCents: cents(account.balanceCents),
    currency: account.currency || 'BRL',
    status: account.status || 'active',
    source: account.source,
    lastSyncedAt: account.lastSyncedAt ?? null,
  }))

  const bank = summarizeBank(input.transactions, startKey, endKey)
  const previousBank = summarizeBank(input.transactions, previousStartKey, previousEndKey)
  const sales = summarizeSales(input.dailyMetrics, input.inventoryState, startKey, endKey)
  const previousSales = summarizeSales(input.dailyMetrics, input.inventoryState, previousStartKey, previousEndKey)

  const bankBalanceCents = accounts
    .filter((account) => account.status === 'active')
    .reduce((sum, account) => sum + account.balanceCents, 0)

  const inventoryValueCents = input.inventoryState.products.reduce((sum, product) => {
    if (product.archivedAt || product.stockMilli <= 0) return sum
    return sum + Math.round(cents(product.averageCostCents) * cents(product.stockMilli) / 1000)
  }, 0)
  const averageDailyCogs = sales.cogsCents > 0 ? sales.cogsCents / input.days : 0
  const inventoryDays = averageDailyCogs > 0
    ? Math.round((inventoryValueCents / averageDailyCogs) * 100) / 100
    : null

  const cashByDay = new Map(keys.map((key) => [key, { inflowsCents: 0, outflowsCents: 0 }]))
  const allDeltaByDay = new Map(keys.map((key) => [key, 0]))

  for (const transaction of bank.operational) {
    const key = dateKey(transaction.postedAt)
    const day = cashByDay.get(key)
    if (!day) continue
    if (transaction.amountCents > 0) day.inflowsCents += cents(transaction.amountCents)
    else day.outflowsCents += Math.abs(cents(transaction.amountCents))
  }

  for (const transaction of bank.periodTransactions) {
    const key = dateKey(transaction.postedAt)
    if (!allDeltaByDay.has(key)) continue
    allDeltaByDay.set(key, (allDeltaByDay.get(key) ?? 0) + cents(transaction.amountCents))
  }

  const periodDelta = [...allDeltaByDay.values()].reduce((sum, amount) => sum + amount, 0)
  let runningBalance = bankBalanceCents - periodDelta
  let cumulativeNetCents = 0
  const cashFlow = keys.map((date) => {
    const cash = cashByDay.get(date) ?? { inflowsCents: 0, outflowsCents: 0 }
    const netCents = cash.inflowsCents - cash.outflowsCents
    cumulativeNetCents += netCents
    runningBalance += allDeltaByDay.get(date) ?? 0
    return {
      date,
      inflowsCents: cash.inflowsCents,
      outflowsCents: cash.outflowsCents,
      netCents,
      cumulativeNetCents,
      balanceCents: runningBalance,
    }
  })

  const metricByDay = new Map(sales.metricRows.map((metric) => [metric.metricDate.slice(0, 10), metric]))
  const salesFlow = keys.map((date) => {
    let salesCents = 0
    let cogsCents = 0
    if (sales.useMetrics) {
      const metric = metricByDay.get(date)
      salesCents = cents(metric?.salesCents)
      cogsCents = cents(metric?.cogsCents)
    } else {
      const derived = sales.derived.daily.get(date)
      salesCents = cents(derived?.salesCents)
      cogsCents = cents(derived?.cogsCents)
    }
    const grossProfitCents = salesCents - cogsCents
    const grossMarginBps = salesCents > 0 ? Math.round(grossProfitCents * 10_000 / salesCents) : null
    return { date, salesCents, cogsCents, grossProfitCents, grossMarginBps }
  })

  const expenseMap = new Map<string, { amountCents: number; transactionCount: number }>()
  const counterpartyMap = new Map<string, { category: string; amountCents: number; transactionCount: number }>()
  for (const transaction of bank.operational) {
    if (transaction.amountCents >= 0) continue
    const amountCents = Math.abs(cents(transaction.amountCents))
    const category = transaction.category?.trim() || 'Outros'
    const expense = expenseMap.get(category) ?? { amountCents: 0, transactionCount: 0 }
    expense.amountCents += amountCents
    expense.transactionCount += 1
    expenseMap.set(category, expense)

    const name = transaction.counterpartyName?.trim() || transaction.description?.trim() || 'Não identificado'
    const counterparty = counterpartyMap.get(name) ?? { category, amountCents: 0, transactionCount: 0 }
    counterparty.amountCents += amountCents
    counterparty.transactionCount += 1
    counterpartyMap.set(name, counterparty)
  }

  const expenseTotalCents = [...expenseMap.values()].reduce((sum, item) => sum + item.amountCents, 0)
  const expenseCategories = [...expenseMap.entries()]
    .map(([category, item]) => ({
      category,
      amountCents: item.amountCents,
      shareBps: expenseTotalCents > 0 ? Math.round(item.amountCents * 10_000 / expenseTotalCents) : 0,
      transactionCount: item.transactionCount,
    }))
    .sort((a, b) => b.amountCents - a.amountCents)

  const topCounterparties = [...counterpartyMap.entries()]
    .map(([name, item]) => ({ name, ...item }))
    .sort((a, b) => b.amountCents - a.amountCents)

  const previousAvailable = previousBank.periodTransactions.length > 0
    || previousSales.metricRows.length > 0
    || previousSales.derived.salesCents > 0

  const previewMode = accounts.some((account) => account.source === 'mock')
    || bank.periodTransactions.some((transaction) => transaction.source === 'mock')
    || sales.metricRows.some((metric) => metric.source === 'mock')

  return {
    period: { days: input.days, start: startKey, end: endKey },
    previewMode,
    summary: {
      bankBalanceCents,
      bankInflowsCents: bank.inflowsCents,
      bankOutflowsCents: bank.outflowsCents,
      netCashFlowCents: bank.netCashFlowCents,
      salesCents: sales.salesCents,
      cogsCents: sales.cogsCents,
      grossProfitCents: sales.grossProfitCents,
      grossMarginBps: sales.grossMarginBps,
      marginEstimated: sales.marginEstimated,
      inventoryValueCents,
      inventoryDays,
    },
    comparison: {
      available: previousAvailable,
      previous: {
        bankInflowsCents: previousBank.inflowsCents,
        bankOutflowsCents: previousBank.outflowsCents,
        netCashFlowCents: previousBank.netCashFlowCents,
        salesCents: previousSales.salesCents,
        cogsCents: previousSales.cogsCents,
        grossProfitCents: previousSales.grossProfitCents,
        grossMarginBps: previousSales.grossMarginBps,
      },
      changes: {
        bankInflowsPct: percentageChange(bank.inflowsCents, previousBank.inflowsCents),
        bankOutflowsPct: percentageChange(bank.outflowsCents, previousBank.outflowsCents),
        netCashFlowPct: percentageChange(bank.netCashFlowCents, previousBank.netCashFlowCents),
        salesPct: percentageChange(sales.salesCents, previousSales.salesCents),
        cogsPct: percentageChange(sales.cogsCents, previousSales.cogsCents),
        grossProfitPct: percentageChange(sales.grossProfitCents, previousSales.grossProfitCents),
        grossMarginDeltaBps: sales.grossMarginBps != null && previousSales.grossMarginBps != null
          ? sales.grossMarginBps - previousSales.grossMarginBps
          : null,
      },
    },
    accounts,
    cashFlow,
    salesFlow,
    expenseCategories,
    topCounterparties,
    transactions: bank.periodTransactions.map((transaction) => ({
      id: transaction.id,
      accountId: transaction.accountId,
      postedAt: transaction.postedAt,
      amountCents: cents(transaction.amountCents),
      description: transaction.description,
      counterpartyName: transaction.counterpartyName ?? null,
      counterpartyTaxId: transaction.counterpartyTaxId ?? null,
      category: transaction.category?.trim() || 'Outros',
      categoryConfidence: transaction.categoryConfidence ?? null,
      transactionType: transaction.transactionType ?? null,
      isInternalTransfer: Boolean(transaction.isInternalTransfer),
      source: transaction.source,
    })),
  }
}
