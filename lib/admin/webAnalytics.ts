import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

const DAY = 24 * 60 * 60 * 1000

type EventRow = {
  id: number
  created_at: string
  session_key: string
  visitor_key: string
  event_type: string
  path: string
  source: string | null
  referrer: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  device_type: string | null
  browser: string | null
  os: string | null
  country: string | null
  region: string | null
  city: string | null
  section: string | null
  target: string | null
  x_ratio: number | null
  y_ratio: number | null
  scroll_ratio: number | null
  value: number | null
  meta: Record<string, unknown> | null
}

function isoSince(days: number) {
  return new Date(Date.now() - days * DAY).toISOString()
}

function countTop(rows: EventRow[], get: (row: EventRow) => string | null | undefined, limit = 10) {
  const map = new Map<string, number>()
  for (const row of rows) {
    const value = get(row)?.trim()
    if (!value) continue
    map.set(value, (map.get(value) || 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count }))
}

function unique(rows: EventRow[], field: 'session_key' | 'visitor_key') {
  return new Set(rows.map((row) => row[field])).size
}

async function fetchEvents() {
  const admin = createAdminClient()
  const fields = 'id,created_at,session_key,visitor_key,event_type,path,source,referrer,utm_source,utm_medium,utm_campaign,device_type,browser,os,country,region,city,section,target,x_ratio,y_ratio,scroll_ratio,value,meta'
  const all: EventRow[] = []
  for (let from = 0; from < 10000; from += 1000) {
    const { data, error } = await admin.from('web_analytics_events')
      .select(fields)
      .gte('created_at', isoSince(30))
      .order('created_at', { ascending: false })
      .range(from, from + 999)
    if (error) {
      if (error.code === '42P01') return []
      throw error
    }
    const page = (data || []) as unknown as EventRow[]
    all.push(...page)
    if (page.length < 1000) break
  }
  return all
}

export async function loadWebAnalytics() {
  const admin = createAdminClient()
  const events = await fetchEvents()
  const { data: leadRows } = await admin
    .from('rpg_interest_leads')
    .select('analytics_session_key,name,business_name,phone,email')
    .not('analytics_session_key', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)
  const leads = new Map<string, { name: string; businessName: string; phone: string; email: string }>()
  for (const row of leadRows || []) {
    if (!row.analytics_session_key) continue
    leads.set(String(row.analytics_session_key), {
      name: String(row.name || ''),
      businessName: String(row.business_name || ''),
      phone: String(row.phone || ''),
      email: String(row.email || ''),
    })
  }
  const now = Date.now()
  const inDays = (days: number) => events.filter((row) => now - new Date(row.created_at).getTime() <= days * DAY)
  const d1 = inDays(1)
  const d7 = inDays(7)
  const d30 = events

  const stats = (rows: EventRow[]) => ({
    visitors: unique(rows, 'visitor_key'),
    sessions: unique(rows, 'session_key'),
    pageviews: rows.filter((row) => row.event_type === 'page_view').length,
  })

  type Session = {
    id: string
    first: string
    last: string
    source: string
    device: string
    browser: string
    os: string
    city: string
    country: string
    landing: string
    pages: Set<string>
    active: number
    maxScroll: number
    interest: boolean
    formStarted: boolean
    formSubmitted: boolean
  }

  const sessions = new Map<string, Session>()
  for (const row of [...d30].reverse()) {
    let session = sessions.get(row.session_key)
    if (!session) {
      session = {
        id: row.session_key,
        first: row.created_at,
        last: row.created_at,
        source: row.source || 'direto',
        device: row.device_type || '—',
        browser: row.browser || '—',
        os: row.os || '—',
        city: row.city || '—',
        country: row.country || '—',
        landing: row.path,
        pages: new Set<string>(),
        active: 0,
        maxScroll: 0,
        interest: false,
        formStarted: false,
        formSubmitted: false,
      }
      sessions.set(row.session_key, session)
    }
    session.last = row.created_at
    if (row.event_type === 'page_view') session.pages.add(row.path)
    if (row.event_type === 'heartbeat') session.active += Number(row.value || 0)
    if (row.event_type === 'scroll') session.maxScroll = Math.max(session.maxScroll, Number(row.scroll_ratio || 0))
    if (row.event_type === 'form_start') session.formStarted = true
    if (row.event_type === 'form_submit_success') session.formSubmitted = true
    if (row.event_type === 'click') {
      const href = typeof row.meta?.href === 'string' ? row.meta.href : ''
      if (href.includes('/interesse')) session.interest = true
    }
  }

  const session7Ids = new Set(d7.map((row) => row.session_key))
  const sessions7 = [...sessions.values()].filter((session) => session7Ids.has(session.id))
  const avgActive = sessions7.length ? Math.round(sessions7.reduce((sum, s) => sum + s.active, 0) / sessions7.length) : 0
  const bounced = sessions7.filter((s) => s.pages.size <= 1 && s.active < 15).length

  const home7 = d7.filter((row) => row.path === '/')
  const pointer7 = home7.filter((row) => row.event_type === 'pointer' && row.x_ratio !== null && row.y_ratio !== null)
  const cols = 16
  const rowsCount = 32
  const heat = Array.from({ length: rowsCount }, () => Array(cols).fill(0) as number[])
  for (const point of pointer7) {
    const x = Math.min(cols - 1, Math.max(0, Math.floor(Number(point.x_ratio) * cols)))
    const y = Math.min(rowsCount - 1, Math.max(0, Math.floor(Number(point.y_ratio) * rowsCount)))
    heat[y][x] += 1
  }
  const heatMax = Math.max(0, ...heat.flat())

  return {
    generatedAt: new Date().toISOString(),
    d1: stats(d1),
    d7: stats(d7),
    d30: stats(d30),
    avgActiveSeconds7: avgActive,
    bounceRate7: sessions7.length ? Math.round((bounced / sessions7.length) * 100) : 0,
    funnel7: {
      landing: new Set(home7.filter((r) => r.event_type === 'page_view').map((r) => r.session_key)).size,
      interestClick: sessions7.filter((s) => s.interest).length,
      formStart: sessions7.filter((s) => s.formStarted).length,
      formSubmit: sessions7.filter((s) => s.formSubmitted).length,
    },
    sources7: countTop(d7.filter((r) => r.event_type === 'page_view'), (r) => r.source || 'direto'),
    campaigns7: countTop(d7.filter((r) => r.event_type === 'page_view'), (r) => r.utm_campaign),
    devices7: countTop(d7.filter((r) => r.event_type === 'page_view'), (r) => r.device_type),
    browsers7: countTop(d7.filter((r) => r.event_type === 'page_view'), (r) => r.browser),
    os7: countTop(d7.filter((r) => r.event_type === 'page_view'), (r) => r.os),
    cities7: countTop(d7.filter((r) => r.event_type === 'page_view'), (r) => r.city && r.city !== '—' ? [r.city, r.region, r.country].filter(Boolean).join(', ') : null),
    pages7: countTop(d7.filter((r) => r.event_type === 'page_view'), (r) => r.path),
    clickTargets7: countTop(d7.filter((r) => r.event_type === 'click'), (r) => r.target, 15),
    pointerSections7: countTop(pointer7, (r) => r.section || 'sem seção', 15),
    heatmap: { cells: heat, max: heatMax, points: pointer7.length },
    recentSessions: [...sessions.values()]
      .sort((a, b) => b.last.localeCompare(a.last))
      .slice(0, 50)
      .map((s) => ({
        id: s.id,
        first: s.first,
        last: s.last,
        source: s.source,
        device: s.device,
        browser: s.browser,
        os: s.os,
        city: s.city,
        country: s.country,
        landing: s.landing,
        pages: s.pages.size,
        active: s.active,
        maxScroll: Math.round(s.maxScroll * 100),
        interest: s.interest,
        formStarted: s.formStarted,
        formSubmitted: s.formSubmitted,
        lead: leads.get(s.id) || null,
      })),
  }
}
