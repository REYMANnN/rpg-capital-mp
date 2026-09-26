import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin/auth'
import { endCourtesy, reopenCourtesy } from '@/lib/admin/coupons'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ ok: false, error: 'not_admin' }, { status: 401 })
  const body = await request.json().catch(() => null) as { businessId?: unknown; action?: unknown } | null
  const businessId = typeof body?.businessId === 'string' && /^[0-9a-f-]{36}$/i.test(body.businessId) ? body.businessId : null
  if (!businessId) return NextResponse.json({ ok: false, error: 'invalid_business' }, { status: 400 })
  if (body?.action === 'end') {
    const result = await endCourtesy(businessId)
    return NextResponse.json(result, { status: result.ok ? 200 : 409 })
  }
  if (body?.action === 'reopen') {
    const ok = await reopenCourtesy(businessId)
    return NextResponse.json({ ok }, { status: ok ? 200 : 409 })
  }
  return NextResponse.json({ ok: false, error: 'invalid_action' }, { status: 400 })
}
