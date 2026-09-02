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

function periodStart(now: Date, days: number) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  start.setUTCDate(start.getUTCDate() - (days - 1))
  return start
}

function dayKeys(start: Date, days: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(date.getUTCDate() + index)
    return date.toISOString().slice(0, 10)
  })
}

function inPeriod(value: string, startKey: string, endKey: string) {
  const key = dateKey(value)
  return Boolean(key && key >= startKey && key <= endKey)
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

export function buildFinanceDashboard(input: FinanceDashboardInput) {
  const now = input.now ?? new Date()
  const start = periodStart(now, input.days)
  const startKey = dateKey(start)
  const endKey = dateKey(now)
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

  const periodTransactions = input.transactions
    .filter((transaction) => inPeriod(transaction.postedAt, startKey, endKey))
    .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())

  const operationalTransactions = periodTransactions.filter((transaction) => !transaction.isInternalTransfer)
  const bankInflowsCents = operationalTransactions
    .filter((transaction) => transaction.amountCents > 0)
    .reduce((sum, transaction) => sum + cents(transaction.amountCents), 0)
  const bankOutflowsCents = operationalTransactions
    .filter((transaction) => transaction.amountCents < 0)
    .reduce((sum, transaction) => sum + Math.abs(cents(transaction.amountCents)), 0)

  const metricRows = input.dailyMetrics.filter((metric) => {
    const key = metric.metricDate.slice(0, 10)
    return key >= startKey && key <= endKey
  })

  const derivedSales = deriveSales(input.inventoryState, startKey, endKey)
  const useMetrics = metricRows.length > 0
  const salesCents = useMetrics
    ? metricRows.reduce((sum, metric) => sum + cents(metric.salesCents), 0)
    : derivedSales.salesCents
  const cogsCents = useMetrics
    ? metricRows.reduce((sum, metric) => sum + cents(metric.cogsCents), 0)
    : derivedSales.cogsCents
  const grossProfitCents = salesCents - cogsCents
  const grossMarginBps = salesCents > 0 ? Math.round(grossProfitCents * 10_000 / salesCents) : null

  const inventoryValueCents = input.inventoryState.products.reduce((sum, product) => {
    if (product.archivedAt || product.stockMilli <= 0) return sum
    return sum + Math.round(cents(product.averageCostCents) * cents(product.stockMilli) / 1000)
  }, 0)
  const averageDailyCogs = cogsCents > 0 ? cogsCents / input.days : 0
  const inventoryDays = averageDailyCogs > 0
    ? Math.round((inventoryValueCents / averageDailyCogs) * 100) / 100
    : null

  const cashByDay = new Map(keys.map((key) => [key, { inflowsCents: 0, outflowsCents: 0 }]))
  for (const transaction of operationalTransactions) {
    const key = dateKey(transaction.postedAt)
    const day = cashByDay.get(key)
    if (!day) continue
    if (transaction.amountCents > 0) day.inflowsCents += cents(transaction.amountCents)
    else day.outflowsCents += Math.abs(cents(transaction.amountCents))
  }

  const metricByDay = new Map(metricRows.map((metric) => [metric.metricDate.slice(0, 10), metric]))
  const salesByDay = keys.map((date) => {
    if (useMetrics) {
      const metric = metricByDay.get(date)
      return { date, salesCents: cents(metric?.salesCents), cogsCents: cents(metric?.cogsCents) }
    }
    const derived = derivedSales.daily.get(date)
    return { date, salesCents: cents(derived?.salesCents), cogsCents: cents(derived?.cogsCents) }
  })

  const expenseMap = new Map<string, number>()
  for (const transaction of operationalTransactions) {
    if (transaction.amountCents >= 0) continue
    const category = transaction.category?.trim() || 'Outros'
    expenseMap.set(category, (expenseMap.get(category) ?? 0) + Math.abs(cents(transaction.amountCents)))
  }
  const expenseCategories = [...expenseMap.entries()]
    .map(([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents)

  const previewMode = accounts.some((account) => account.source === 'mock')
    || periodTransactions.some((transaction) => transaction.source === 'mock')
    || metricRows.some((metric) => metric.source === 'mock')

  return {
    period: { days: input.days, start: startKey, end: endKey },
    previewMode,
    summary: {
      bankBalanceCents: accounts
        .filter((account) => account.status === 'active')
        .reduce((sum, account) => sum + account.balanceCents, 0),
      bankInflowsCents,
      bankOutflowsCents,
      netCashFlowCents: bankInflowsCents - bankOutflowsCents,
      salesCents,
      cogsCents,
      grossProfitCents,
      grossMarginBps,
      marginEstimated: useMetrics ? false : derivedSales.marginEstimated,
      inventoryValueCents,
      inventoryDays,
    },
    accounts,
    cashFlow: keys.map((date) => ({ date, ...(cashByDay.get(date) ?? { inflowsCents: 0, outflowsCents: 0 }) })),
    salesFlow: salesByDay,
    expenseCategories,
    transactions: periodTransactions.map((transaction) => ({
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
