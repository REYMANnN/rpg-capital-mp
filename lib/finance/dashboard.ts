export type FinanceSource = 'mock' | 'malvo' | 'manual'
export type MetricSource = 'mock' | 'derived'
export type CheckoutPaymentMethod = 'pix' | 'card' | 'cash'

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
  payment?: {
    method?: CheckoutPaymentMethod
    confirmedAt?: string
  }
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

function saleCost(sale: InventorySaleInput, costByProduct: Map<string, number>) {
  if (typeof sale.cogsCents === 'number' && Number.isFinite(sale.cogsCents)) {
    return { cogsCents: cents(sale.cogsCents), estimated: false }
  }

  let estimated = false
  const cogsCents = (sale.items ?? []).reduce((sum, item) => {
    if (typeof item.lineCostCents === 'number' && Number.isFinite(item.lineCostCents)) {
      return sum + cents(item.lineCostCents)
    }
    estimated = true
    const unitCost = typeof item.unitCostCents === 'number'
      ? cents(item.unitCostCents)
      : costByProduct.get(item.productId) ?? 0
    return sum + Math.round(unitCost * cents(item.quantityMilli) / 1000)
  }, 0)

  return { cogsCents, estimated }
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
    const cost = saleCost(sale, costByProduct)
    if (cost.estimated) marginEstimated = true

    salesCents += saleRevenue
    cogsCents += cost.cogsCents
    const key = dateKey(sale.createdAt)
    const existing = daily.get(key) ?? { salesCents: 0, cogsCents: 0 }
    existing.salesCents += saleRevenue
    existing.cogsCents += cost.cogsCents
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

function normalizedText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

function acquirerProvider(transaction: FinanceTransactionInput) {
  if (transaction.amountCents <= 0 || transaction.isInternalTransfer) return null
  const description = normalizedText(transaction.description || '')
  const counterparty = normalizedText(transaction.counterpartyName || '')
  const combined = `${counterparty} ${description}`

  const providers: Array<[RegExp, string]> = [
    [/\bGETNET\b/, 'Getnet'],
    [/\bSTONE\b/, 'Stone'],
    [/\bCIELO\b/, 'Cielo'],
    [/(?:\bREDE\s+(?:PAGAMENTOS?|CARD)\b|\bREDECARD\b)/, 'Rede'],
    [/\bPAGSEGURO\b/, 'PagSeguro'],
    [/\bPAGBANK\b/, 'PagBank'],
    [/\bMERCADO\s*PAGO\b/, 'Mercado Pago'],
    [/\bSAFRAPAY\b/, 'SafraPay'],
    [/\bSUMUP\b/, 'SumUp'],
    [/\bINFINITEPAY\b/, 'InfinitePay'],
  ]

  for (const [pattern, provider] of providers) {
    if (pattern.test(combined)) return provider
  }
  if (counterparty.trim() === 'REDE') return 'Rede'
  return null
}

function checkoutPaymentMetrics(
  state: FinanceInventoryState,
  transactions: FinanceTransactionInput[],
  startKey: string,
  endKey: string,
) {
  const periodSales = state.sales
    .filter((sale) => inPeriod(sale.createdAt, startKey, endKey))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const costByProduct = new Map(
    state.products.map((product) => [product.id, cents(product.averageCostCents)]),
  )

  const paymentSummary = {
    cardSalesCents: 0,
    pixSalesCents: 0,
    cashSalesCents: 0,
    legacySalesCents: 0,
  }

  for (const sale of periodSales) {
    const amount = cents(sale.totalCents)
    if (sale.payment?.method === 'card') paymentSummary.cardSalesCents += amount
    else if (sale.payment?.method === 'pix') paymentSummary.pixSalesCents += amount
    else if (sale.payment?.method === 'cash') paymentSummary.cashSalesCents += amount
    else paymentSummary.legacySalesCents += amount
  }

  const recentSales = periodSales.slice(0, 50).map((sale) => {
    const cost = saleCost(sale, costByProduct)
    const totalCents = cents(sale.totalCents)
    const grossProfitCents = typeof sale.grossProfitCents === 'number' && Number.isFinite(sale.grossProfitCents)
      ? cents(sale.grossProfitCents)
      : totalCents - cost.cogsCents
    return {
      id: sale.id,
      createdAt: sale.createdAt,
      paymentMethod: sale.payment?.method ?? null,
      totalCents,
      cogsCents: cost.cogsCents,
      grossProfitCents,
      costEstimated: cost.estimated,
    }
  })

  const cardSales = periodSales
    .filter((sale) => sale.payment?.method === 'card')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  const matchedSaleIds = new Set<string>()
  const recognized = transactions
    .filter((transaction) => inPeriod(transaction.postedAt, startKey, endKey))
    .map((transaction) => ({ transaction, provider: acquirerProvider(transaction) }))
    .filter((entry): entry is { transaction: FinanceTransactionInput; provider: string } => Boolean(entry.provider))
    .sort((a, b) => new Date(a.transaction.postedAt).getTime() - new Date(b.transaction.postedAt).getTime())

  let reconciledGrossCents = 0
  let reconciledSettlementCents = 0
  const settlements = recognized.map(({ transaction, provider }) => {
    const settlementTime = new Date(transaction.postedAt).getTime()
    const settlementDay = dayStart(new Date(transaction.postedAt))
    const eligible = cardSales.filter((sale) => {
      if (matchedSaleIds.has(sale.id)) return false
      const saleTime = new Date(sale.createdAt).getTime()
      if (!Number.isFinite(saleTime) || saleTime > settlementTime) return false
      const saleDay = dayStart(new Date(sale.createdAt))
      const ageDays = Math.round((settlementDay.getTime() - saleDay.getTime()) / 86_400_000)
      return ageDays >= 0 && ageDays <= 7
    })

    const buckets = new Map<string, InventorySaleInput[]>()
    for (const sale of eligible) {
      const key = dateKey(sale.createdAt)
      const list = buckets.get(key) ?? []
      list.push(sale)
      buckets.set(key, list)
    }
    const bucketEntries = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))
    const settlementCents = cents(transaction.amountCents)
    let best: { sales: InventorySaleInput[]; grossCents: number; feeCents: number; feeRateBps: number; endKey: string } | null = null

    for (let startIndex = 0; startIndex < bucketEntries.length; startIndex += 1) {
      let windowSales: InventorySaleInput[] = []
      let grossCents = 0
      for (let endIndex = startIndex; endIndex < bucketEntries.length; endIndex += 1) {
        const [bucketKey, bucketSales] = bucketEntries[endIndex]
        windowSales = [...windowSales, ...bucketSales]
        grossCents += bucketSales.reduce((sum, sale) => sum + cents(sale.totalCents), 0)
        if (grossCents < settlementCents || grossCents <= 0) continue
        const feeCents = grossCents - settlementCents
        const feeRateBps = Math.round(feeCents * 10_000 / grossCents)
        if (feeRateBps < 0 || feeRateBps > 1000) continue

        const candidate = { sales: [...windowSales], grossCents, feeCents, feeRateBps, endKey: bucketKey }
        if (
          !best
          || candidate.feeRateBps < best.feeRateBps
          || (candidate.feeRateBps === best.feeRateBps && candidate.sales.length < best.sales.length)
          || (candidate.feeRateBps === best.feeRateBps && candidate.sales.length === best.sales.length && candidate.endKey > best.endKey)
        ) {
          best = candidate
        }
      }
    }

    if (!best) {
      return {
        transactionId: transaction.id,
        provider,
        postedAt: transaction.postedAt,
        receivedCents: settlementCents,
        status: 'recognized' as const,
        matchedGrossCents: null,
        feeCents: null,
        feeRateBps: null,
      }
    }

    for (const sale of best.sales) matchedSaleIds.add(sale.id)
    reconciledGrossCents += best.grossCents
    reconciledSettlementCents += settlementCents
    return {
      transactionId: transaction.id,
      provider,
      postedAt: transaction.postedAt,
      receivedCents: settlementCents,
      status: 'reconciled' as const,
      matchedGrossCents: best.grossCents,
      feeCents: best.feeCents,
      feeRateBps: best.feeRateBps,
    }
  })

  const grossCardSalesCents = paymentSummary.cardSalesCents
  const pendingGrossCents = cardSales
    .filter((sale) => !matchedSaleIds.has(sale.id))
    .reduce((sum, sale) => sum + cents(sale.totalCents), 0)
  const recognizedSettlementCents = recognized.reduce((sum, entry) => sum + cents(entry.transaction.amountCents), 0)
  const estimatedFeeCents = reconciledGrossCents - reconciledSettlementCents
  const estimatedFeeRateBps = reconciledGrossCents > 0
    ? Math.round(estimatedFeeCents * 10_000 / reconciledGrossCents)
    : null

  return {
    paymentSummary,
    recentSales,
    card: {
      grossCardSalesCents,
      pendingGrossCents,
      recognizedSettlementCents,
      reconciledGrossCents,
      reconciledSettlementCents,
      estimatedFeeCents,
      estimatedFeeRateBps,
      settlements: settlements.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()),
    },
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
  const checkout = checkoutPaymentMetrics(input.inventoryState, input.transactions, startKey, endKey)

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
    paymentSummary: checkout.paymentSummary,
    card: checkout.card,
    recentSales: checkout.recentSales,
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