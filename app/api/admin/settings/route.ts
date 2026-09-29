import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin/auth'
import { readAdminCommercialSettings, saveAdminCommercialSettings } from '@/lib/admin/invites'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const denied = () => NextResponse.json({ ok: false, error: 'not_admin' }, { status: 401 })

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return denied()
  return NextResponse.json({ ok: true, ...(await readAdminCommercialSettings()) })
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return denied()
  const body = await request.json().catch(() => null) as { pixKey?: unknown; planPriceCents?: unknown } | null
  const pixKey = typeof body?.pixKey === 'string' ? body.pixKey : ''
  const planPriceCents = Number(body?.planPriceCents)
  if (!Number.isInteger(planPriceCents) || planPriceCents <= 0) return NextResponse.json({ ok: false, error: 'invalid_price' }, { status: 400 })
  try {
    const settings = await saveAdminCommercialSettings({ pixKey, planPriceCents })
    return NextResponse.json({ ok: true, ...settings })
  } catch {
    return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 500 })
  }
}
