import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { authorizeInventoryContext } from '@/lib/accounts/requestContext'
import { buildFinanceDashboard, type FinanceAccountInput, type FinanceDailyMetricInput, type FinanceTransactionInput } from '@/lib/finance/dashboard'
import { createAdminClient } from '@/lib/supabase/admin'
import { INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE } from '@/lib/accounts/terminal'

export const dynamic = 'force-dynamic'

const ALLOWED_DAYS = new Set([7, 30, 90])

function startForDays(days: number) {
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  return start
}

export async function GET(request: Request) {
  const requestedDays = Number(new URL(request.url).searchParams.get('days') || '30')
  const days = (ALLOWED_DAYS.has(requestedDays) ? requestedDays : 30) as 7 | 30 | 90
  const jar = await cookies()
  const context = await authorizeInventoryContext({
    installationId: jar.get(INVENTORY_INSTALLATION_COOKIE)?.value,
    terminalCookie: jar.get(TERMINAL_COOKIE)?.value,
    staffCookie: jar.get(STAFF_SESSION_COOKIE)?.value,
  })

  if (!context.authorized || !context.store) {
    return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 })
  }
  if (context.mode === 'staff' && !context.staff?.permissions.has('analysis.financial')) {
    return NextResponse.json({ error: 'Seu perfil não tem acesso ao Financeiro.' }, { status: 403 })
  }

  const admin = createAdminClient()
  const start = startForDays(days)
  const startDate = start.toISOString().slice(0, 10)
  const now = new Date()
  const storeId = context.store.id
  const businessId = context.store.business_id
  const installationId = context.store.installation_id

  const [accountsResult, transactionsResult, metricsResult, inventoryResult] = await Promise.all([
    admin
      .from('balcao_finance_accounts')
      .select('id, institution_name, account_name, account_type, masked_number, balance_cents, currency, status, source, last_synced_at')
      .eq('business_id', businessId)
      .eq('store_id', storeId)
      .order('created_at', { ascending: true }),
    admin
      .from('balcao_finance_transactions')
      .select('id, account_id, posted_at, amount_cents, description, counterparty_name, counterparty_tax_id, category, category_confidence, transaction_type, is_internal_transfer, source')
      .eq('business_id', businessId)
      .eq('store_id', storeId)
      .gte('posted_at', start.toISOString())
      .lte('posted_at', now.toISOString())
      .order('posted_at', { ascending: false })
      .limit(500),
    admin
      .from('balcao_finance_daily_metrics')
      .select('metric_date, sales_cents, cogs_cents, units_sold_milli, source')
      .eq('business_id', businessId)
      .eq('store_id', storeId)
      .gte('metric_date', startDate)
      .lte('metric_date', now.toISOString().slice(0, 10))
      .order('metric_date', { ascending: true }),
    admin.rpc('inventory_v1_get_state', { p_installation_id: installationId }),
  ])

  const queryError = accountsResult.error ?? transactionsResult.error ?? metricsResult.error ?? inventoryResult.error
  if (queryError) {
    console.error('BALCAO finance dashboard query failed', queryError)
    return NextResponse.json({ error: 'Não conseguimos carregar o Financeiro.' }, { status: 500 })
  }

  const accounts: FinanceAccountInput[] = (accountsResult.data ?? []).map((row: any) => ({
    id: row.id,
    institutionName: row.institution_name,
    accountName: row.account_name,
    accountType: row.account_type,
    maskedNumber: row.masked_number,
    balanceCents: Number(row.balance_cents ?? 0),
    currency: row.currency,
    status: row.status,
    source: row.source,
    lastSyncedAt: row.last_synced_at,
  }))

  const transactions: FinanceTransactionInput[] = (transactionsResult.data ?? []).map((row: any) => ({
    id: row.id,
    accountId: row.account_id,
    postedAt: row.posted_at,
    amountCents: Number(row.amount_cents ?? 0),
    description: row.description,
    counterpartyName: row.counterparty_name,
    counterpartyTaxId: row.counterparty_tax_id,
    category: row.category,
    categoryConfidence: row.category_confidence == null ? null : Number(row.category_confidence),
    transactionType: row.transaction_type,
    isInternalTransfer: Boolean(row.is_internal_transfer),
    source: row.source,
  }))

  const dailyMetrics: FinanceDailyMetricInput[] = (metricsResult.data ?? []).map((row: any) => ({
    metricDate: row.metric_date,
    salesCents: Number(row.sales_cents ?? 0),
    cogsCents: Number(row.cogs_cents ?? 0),
    unitsSoldMilli: Number(row.units_sold_milli ?? 0),
    source: row.source,
  }))

  const rawState = inventoryResult.data && typeof inventoryResult.data === 'object'
    ? inventoryResult.data as any
    : {}
  const inventoryState = {
    products: Array.isArray(rawState.products) ? rawState.products : [],
    sales: Array.isArray(rawState.sales) ? rawState.sales : [],
  }

  const dashboard = buildFinanceDashboard({ days, now, accounts, transactions, dailyMetrics, inventoryState })
  return NextResponse.json({ ok: true, dashboard }, {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
