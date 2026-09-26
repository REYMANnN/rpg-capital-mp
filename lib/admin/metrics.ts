import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { couponLink } from '@/lib/admin/coupons'

// Números do painel de admin. Tudo lido com a chave de serviço, só no servidor.

const DAY = 24 * 60 * 60 * 1000
const PRICE_CENTS = 999
const FALLBACK_USD_BRL = 5.5

type Row = Record<string, unknown>

function since(days: number) {
  return new Date(Date.now() - days * DAY).toISOString()
}

function startOfTodaySaoPaulo() {
  const now = new Date()
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const diff = now.getTime() - local.getTime()
  local.setHours(0, 0, 0, 0)
  return new Date(local.getTime() + diff).toISOString()
}

async function usdToBrl(): Promise<{ rate: number; live: boolean }> {
  try {
    const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', { next: { revalidate: 3600 } })
    const data = await response.json() as { USDBRL?: { bid?: string } }
    const rate = Number(data?.USDBRL?.bid)
    if (Number.isFinite(rate) && rate > 1 && rate < 20) return { rate, live: true }
  } catch {}
  return { rate: FALLBACK_USD_BRL, live: false }
}

function countBy<T extends Row>(rows: T[], key: keyof T) {
  const out: Record<string, number> = {}
  for (const row of rows) {
    const value = String(row[key] ?? '—')
    out[value] = (out[value] || 0) + 1
  }
  return out
}

export type AdminCoupon = {
  code: string
  note: string
  status: string
  link: string
  createdAt: string
  redeemedAt: string | null
  businessName: string | null
}

export type AdminAccount = {
  businessId: string
  name: string
  phone: string | null
  createdAt: string
  billingStatus: string
  couponCode: string | null
  courtesyEndsAt: string | null
  bank: string | null
  rafaNumbers: number
  sales30d: number
}

export type AdminMetrics = Awaited<ReturnType<typeof loadAdminMetrics>>

export async function loadAdminMetrics() {
  const admin = createAdminClient()
  const today = startOfTodaySaoPaulo()
  const d7 = since(7)
  const d30 = since(30)

  const [
    businessesQ, storesQ, billingQ, couponsQ, financeQ, aiQ, outboxQ, inboundQ, instanceQ, salesQ, bindingsQ, linksQ, usersQ, fx,
  ] = await Promise.all([
    admin.from('balcao_businesses').select('id, display_name, phone, created_at, active').order('created_at', { ascending: false }),
    admin.from('inventory_v1_stores').select('id, business_id, display_name, active, created_at'),
    admin.from('balcao_billing_accounts').select('business_id, status, monthly_amount_cents, coupon_code, courtesy_ends_at, created_at'),
    admin.from('balcao_coupons').select('code, note, status, created_at, redeemed_at, redeemed_business_id').order('created_at', { ascending: false }),
    admin.from('balcao_finance_connections').select('business_id, store_id, provider, institution_name, status, execution_status, last_synced_at, last_error_message'),
    admin.from('ai_usage').select('store_id, operation, model, input_tokens, output_tokens, estimated_cost_usd, created_at').gte('created_at', d30).limit(20000),
    admin.from('wa_outbox').select('status, to_phone, created_at').gte('created_at', d30).limit(20000),
    admin.from('whatsapp_inbound_messages').select('from_phone, received_at').gte('received_at', d30).limit(20000),
    admin.from('wa_instance_state').select('instance, state, updated_at'),
    admin.from('inventory_v1_sales').select('store_id, total_cents, sold_at, system_tag').gte('sold_at', d30).limit(20000),
    admin.from('wa_store_bindings').select('wa_id, store_id'),
    admin.from('wa_links').select('fluxo, created_at, opened_at').gte('created_at', d30).limit(20000),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    usdToBrl(),
  ])

  const businesses = (businessesQ.data || []) as Row[]
  const stores = (storesQ.data || []) as Row[]
  const billing = (billingQ.data || []) as Row[]
  const coupons = (couponsQ.data || []) as Row[]
  const finance = (financeQ.data || []) as Row[]
  const ai = (aiQ.data || []) as Row[]
  const outbox = (outboxQ.data || []) as Row[]
  const inbound = (inboundQ.data || []) as Row[]
  const sales = ((salesQ.data || []) as Row[]).filter((row) => row.system_tag !== 'demo')
  const bindings = (bindingsQ.data || []) as Row[]
  const links = (linksQ.data || []) as Row[]
  const users = usersQ.data?.users || []

  const activeBusinesses = businesses.filter((row) => row.active !== false)
  const businessName = new Map(businesses.map((row) => [String(row.id), String(row.display_name || 'Loja')]))
  const storeBusiness = new Map(stores.map((row) => [String(row.id), String(row.business_id || '')]))
  const billingByBusiness = new Map(billing.map((row) => [String(row.business_id), row]))

  // Cobrança
  const billingStatus = countBy(billing, 'status')
  const paying = billing.filter((row) => row.status === 'configured' || row.status === 'active').length
  const courtesy = billing.filter((row) => row.status === 'courtesy' || row.status === 'courtesy_ending').length
  const noBilling = activeBusinesses.filter((row) => !billingByBusiness.has(String(row.id))).length

  // IA (custo em reais)
  type AiTotals = { calls: number; input: number; output: number; usd: number }
  const aiSum = (rows: Row[]): AiTotals => rows.reduce<AiTotals>((acc, row) => ({
    calls: acc.calls + 1,
    input: acc.input + Number(row.input_tokens || 0),
    output: acc.output + Number(row.output_tokens || 0),
    usd: acc.usd + Number(row.estimated_cost_usd || 0),
  }), { calls: 0, input: 0, output: 0, usd: 0 })
  const toBrl = (usd: number) => usd * fx.rate
  const aiToday = aiSum(ai.filter((row) => String(row.created_at) >= today))
  const ai7 = aiSum(ai.filter((row) => String(row.created_at) >= d7))
  const ai30 = aiSum(ai)
  const aiByOperation = Object.entries(ai.reduce<Record<string, { calls: number; tokens: number; usd: number }>>((acc, row) => {
    const key = String(row.operation || '—')
    acc[key] ||= { calls: 0, tokens: 0, usd: 0 }
    acc[key].calls += 1
    acc[key].tokens += Number(row.input_tokens || 0) + Number(row.output_tokens || 0)
    acc[key].usd += Number(row.estimated_cost_usd || 0)
    return acc
  }, {})).map(([operation, value]) => ({ operation, calls: value.calls, tokens: value.tokens, brl: toBrl(value.usd) })).sort((a, b) => b.brl - a.brl)
  const aiByStore = Object.entries(ai.reduce<Record<string, number>>((acc, row) => {
    const business = storeBusiness.get(String(row.store_id)) || ''
    const key = business ? businessName.get(business) || 'Loja' : 'Sem loja'
    acc[key] = (acc[key] || 0) + Number(row.estimated_cost_usd || 0)
    return acc
  }, {})).map(([name, usd]) => ({ name, brl: toBrl(usd) })).sort((a, b) => b.brl - a.brl).slice(0, 8)

  // WhatsApp
  const outToday = outbox.filter((row) => String(row.created_at) >= today)
  const out7 = outbox.filter((row) => String(row.created_at) >= d7)
  const in7 = inbound.filter((row) => String(row.received_at) >= d7)
  const SENT = new Set(['sent', 'pending', 'server_ack', 'delivered', 'read'])
  const whatsapp = {
    sentToday: outToday.filter((row) => SENT.has(String(row.status))).length,
    sent7: out7.filter((row) => SENT.has(String(row.status))).length,
    read7: out7.filter((row) => row.status === 'read').length,
    failed7: out7.filter((row) => row.status === 'failed' || row.status === 'fallback').length,
    pending: outbox.filter((row) => row.status === 'queued' || row.status === 'sending').length,
    inboundToday: inbound.filter((row) => String(row.received_at) >= today).length,
    inbound7: in7.length,
    activeNumbers7: new Set(in7.map((row) => String(row.from_phone))).size,
    linkedNumbers: bindings.length,
    links7: links.filter((row) => String(row.created_at) >= d7).length,
    linksOpened7: links.filter((row) => String(row.created_at) >= d7 && row.opened_at).length,
    instances: ((instanceQ.data || []) as Row[]).map((row) => ({ instance: String(row.instance), state: String(row.state), updatedAt: String(row.updated_at) })),
  }

  // Malvo (Open Finance)
  const malvo = finance.filter((row) => row.provider === 'malvo')
  const malvoStatus = countBy(malvo, 'status')
  const malvoProblems = malvo
    .filter((row) => row.status !== 'active' || row.last_error_message)
    .map((row) => ({
      name: businessName.get(String(row.business_id)) || 'Loja',
      bank: String(row.institution_name || '—'),
      status: String(row.status || '—'),
      lastSync: row.last_synced_at ? String(row.last_synced_at) : null,
      error: row.last_error_message ? String(row.last_error_message).slice(0, 140) : null,
    }))
  const bankByBusiness = new Map<string, string>()
  for (const row of malvo) bankByBusiness.set(String(row.business_id), `${row.institution_name || 'Banco'} · ${row.status}`)

  // Vendas
  const sales7 = sales.filter((row) => String(row.sold_at) >= d7)
  const salesByBusiness = new Map<string, number>()
  for (const row of sales) {
    const business = storeBusiness.get(String(row.store_id)) || ''
    salesByBusiness.set(business, (salesByBusiness.get(business) || 0) + 1)
  }
  const rafaByBusiness = new Map<string, number>()
  for (const row of bindings) {
    const business = storeBusiness.get(String(row.store_id)) || ''
    rafaByBusiness.set(business, (rafaByBusiness.get(business) || 0) + 1)
  }

  const accounts: AdminAccount[] = activeBusinesses.map((row) => {
    const id = String(row.id)
    const bill = billingByBusiness.get(id)
    return {
      businessId: id,
      name: String(row.display_name || 'Loja'),
      phone: row.phone ? String(row.phone) : null,
      createdAt: String(row.created_at),
      billingStatus: bill ? String(bill.status) : 'sem_cobranca',
      couponCode: bill?.coupon_code ? String(bill.coupon_code) : null,
      courtesyEndsAt: bill?.courtesy_ends_at ? String(bill.courtesy_ends_at) : null,
      bank: bankByBusiness.get(id) || null,
      rafaNumbers: rafaByBusiness.get(id) || 0,
      sales30d: salesByBusiness.get(id) || 0,
    }
  })

  const couponList: AdminCoupon[] = coupons.map((row) => ({
    code: String(row.code),
    note: String(row.note || ''),
    status: String(row.status),
    link: couponLink(String(row.code)),
    createdAt: String(row.created_at),
    redeemedAt: row.redeemed_at ? String(row.redeemed_at) : null,
    businessName: row.redeemed_business_id ? businessName.get(String(row.redeemed_business_id)) || 'Loja' : null,
  }))

  return {
    generatedAt: new Date().toISOString(),
    fx,
    overview: {
      accounts: activeBusinesses.length,
      accounts7: activeBusinesses.filter((row) => String(row.created_at) >= d7).length,
      accounts30: activeBusinesses.filter((row) => String(row.created_at) >= d30).length,
      users: users.length,
      users7: users.filter((user) => String(user.created_at) >= d7).length,
      stores: stores.filter((row) => row.active !== false).length,
      paying,
      courtesy,
      noBilling,
      mrrCents: paying * PRICE_CENTS,
      activeStores7: new Set(sales7.map((row) => String(row.store_id))).size,
    },
    billingStatus,
    sales: {
      count7: sales7.length,
      total7Cents: sales7.reduce((sum, row) => sum + Number(row.total_cents || 0), 0),
      count30: sales.length,
      total30Cents: sales.reduce((sum, row) => sum + Number(row.total_cents || 0), 0),
    },
    ai: {
      today: { ...aiToday, brl: toBrl(aiToday.usd) },
      d7: { ...ai7, brl: toBrl(ai7.usd) },
      d30: { ...ai30, brl: toBrl(ai30.usd) },
      byOperation: aiByOperation,
      byStore: aiByStore,
    },
    whatsapp,
    malvo: { total: malvo.length, status: malvoStatus, problems: malvoProblems },
    accounts,
    coupons: couponList,
  }
}
