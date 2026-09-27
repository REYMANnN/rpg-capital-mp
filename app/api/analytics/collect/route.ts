import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const scalar = z.union([z.string().max(300), z.number(), z.boolean(), z.null()])
const eventSchema = z.object({
  type: z.enum(['page_view','click','pointer','scroll','heartbeat','performance','form_start','form_submit_attempt','form_submit_success']),
  path: z.string().min(1).max(300),
  section: z.string().max(100).optional().nullable(),
  target: z.string().max(180).optional().nullable(),
  x: z.number().min(0).max(1).optional().nullable(),
  y: z.number().min(0).max(1).optional().nullable(),
  scroll: z.number().min(0).max(1).optional().nullable(),
  value: z.number().finite().optional().nullable(),
  meta: z.record(z.string(), scalar).optional(),
})

const contextSchema = z.object({
  sessionId: z.string().uuid(),
  visitorId: z.string().uuid(),
  source: z.string().max(180).optional().nullable(),
  referrer: z.string().max(500).optional().nullable(),
  utmSource: z.string().max(180).optional().nullable(),
  utmMedium: z.string().max(180).optional().nullable(),
  utmCampaign: z.string().max(180).optional().nullable(),
  utmContent: z.string().max(180).optional().nullable(),
  utmTerm: z.string().max(180).optional().nullable(),
  deviceType: z.enum(['desktop','mobile','tablet','unknown']),
  browser: z.string().max(80),
  os: z.string().max(80),
  viewportWidth: z.number().int().min(1).max(10000),
  viewportHeight: z.number().int().min(1).max(10000),
  screenWidth: z.number().int().min(1).max(20000),
  screenHeight: z.number().int().min(1).max(20000),
  language: z.string().max(40),
  timezone: z.string().max(80),
})

const bodySchema = z.object({
  context: contextSchema,
  events: z.array(eventSchema).min(1).max(50),
})

function header(request: NextRequest, name: string) {
  const value = request.headers.get(name)?.trim()
  if (!value) return null
  try { return decodeURIComponent(value).slice(0, 160) } catch { return value.slice(0, 160) }
}

export async function POST(request: NextRequest) {
  const length = Number(request.headers.get('content-length') || '0')
  if (length > 80_000) return NextResponse.json({ ok: false }, { status: 413 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 })

  const c = parsed.data.context
  const rows = parsed.data.events.map((event) => ({
    session_key: c.sessionId,
    visitor_key: c.visitorId,
    event_type: event.type,
    path: event.path,
    source: c.source || null,
    referrer: c.referrer || null,
    utm_source: c.utmSource || null,
    utm_medium: c.utmMedium || null,
    utm_campaign: c.utmCampaign || null,
    utm_content: c.utmContent || null,
    utm_term: c.utmTerm || null,
    device_type: c.deviceType,
    browser: c.browser,
    os: c.os,
    viewport_width: c.viewportWidth,
    viewport_height: c.viewportHeight,
    screen_width: c.screenWidth,
    screen_height: c.screenHeight,
    language: c.language,
    timezone: c.timezone,
    country: header(request, 'x-vercel-ip-country'),
    region: header(request, 'x-vercel-ip-country-region'),
    city: header(request, 'x-vercel-ip-city'),
    section: event.section || null,
    target: event.target || null,
    x_ratio: event.x ?? null,
    y_ratio: event.y ?? null,
    scroll_ratio: event.scroll ?? null,
    value: event.value ?? null,
    meta: event.meta || {},
  }))

  const { error } = await createAdminClient().from('web_analytics_events').insert(rows)
  if (error) {
    console.error('web_analytics_insert_failed', { code: error.code })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
