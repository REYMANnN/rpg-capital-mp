import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { buildFinanceDashboard, type FinanceAccountInput, type FinanceDailyMetricInput, type FinanceTransactionInput, type FinanceInventoryState } from '@/lib/finance/dashboard'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { hashSecret, INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE, unpackCredential } from '@/lib/accounts/terminal'

export const dynamic = 'force-dynamic'

const ALLOWED_DAYS = new Set([7, 30, 90])

type FinanceSourcePayload = {
  days?: number
  accounts?: any[]
  transactions?: any[]
  dailyMetrics?: any[]
  inventoryState?: { products?: any[]; sales?: any[] }
}

function financeError(message: string) {
  if (message.includes('BALCAO_FINANCE_FORBIDDEN')) {
    return { status: 403, error: 'Seu perfil não tem acesso ao Financeiro.' }
  }
  return { status: 500, error: 'Não conseguimos carregar o Financeiro.' }
}

export async function GET(request: Request) {
  const requestedDays = Number(new URL(request.url).searchParams.get('days') || '30')
  const days = (ALLOWED_DAYS.has(requestedDays) ? requestedDays : 30) as 7 | 30 | 90
  const jar = await cookies()
  const terminal = unpackCredential(jar.get(TERMINAL_COOKIE)?.value)
  const session = unpackCredential(jar.get(STAFF_SESSION_COOKIE)?.value)
  const installationId = jar.get(INVENTORY_INSTALLATION_COOKIE)?.value ?? null

  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('balcao_finance_dashboard_source', {
    p_installation_id: installationId,
    p_terminal_id: terminal?.id ?? null,
    p_terminal_hash: terminal ? hashSecret(terminal.secret) : null,
    p_session_id: session?.id ?? null,
    p_session_hash: session ? hashSecret(session.secret) : null,
    p_days: days,
  })

  if (error) {
    const mapped = financeError(error.message)
    if (mapped.status === 500) console.error('BALCAO finance dashboard RPC failed', error)
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  const source = data && typeof data === 'object' ? data as FinanceSourcePayload : {}
  const accounts: FinanceAccountInput[] = (source.accounts ?? []).map((row: any) => ({
    id: String(row.id),
    institutionName: String(row.institution_name || ''),
    accountName: row.account_name ?? null,
    accountType: row.account_type ?? null,
    maskedNumber: row.masked_number ?? null,
    balanceCents: Number(row.balance_cents ?? 0),
    currency: row.currency ?? 'BRL',
    status: row.status ?? 'active',
    source: row.source,
    lastSyncedAt: row.last_synced_at ?? null,
  }))

  const transactions: FinanceTransactionInput[] = (source.transactions ?? []).map((row: any) => ({
    id: String(row.id),
    accountId: String(row.account_id),
    postedAt: String(row.posted_at),
    amountCents: Number(row.amount_cents ?? 0),
    description: String(row.description || ''),
    counterpartyName: row.counterparty_name ?? null,
    counterpartyTaxId: row.counterparty_tax_id ?? null,
    category: row.category ?? null,
    categoryConfidence: row.category_confidence == null ? null : Number(row.category_confidence),
    transactionType: row.transaction_type ?? null,
    isInternalTransfer: Boolean(row.is_internal_transfer),
    source: row.source,
  }))

  const dailyMetrics: FinanceDailyMetricInput[] = (source.dailyMetrics ?? []).map((row: any) => ({
    metricDate: String(row.metric_date),
    salesCents: Number(row.sales_cents ?? 0),
    cogsCents: Number(row.cogs_cents ?? 0),
    unitsSoldMilli: Number(row.units_sold_milli ?? 0),
    source: row.source,
  }))

  const rawInventory = source.inventoryState && typeof source.inventoryState === 'object'
    ? source.inventoryState
    : {}
  const inventoryState: FinanceInventoryState = {
    products: Array.isArray(rawInventory.products) ? rawInventory.products : [],
    sales: Array.isArray(rawInventory.sales) ? rawInventory.sales : [],
  }

  const dashboard = buildFinanceDashboard({
    days,
    now: new Date(),
    accounts,
    transactions,
    dailyMetrics,
    inventoryState,
  })

  return NextResponse.json({ ok: true, dashboard }, {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
