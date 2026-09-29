import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin/auth'
import { markPixPaid } from '@/lib/admin/invites'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ ok: false, error: 'not_admin' }, { status: 401 })
  const body = await request.json().catch(() => null) as { businessId?: unknown; amountCents?: unknown; note?: unknown } | null
  const businessId = typeof body?.businessId === 'string' && /^[0-9a-f-]{36}$/i.test(body.businessId) ? body.businessId : ''
  if (!businessId) return NextResponse.json({ ok: false, error: 'invalid_business' }, { status: 400 })
  try {
    const payment = await markPixPaid({
      businessId,
      amountCents: body?.amountCents == null ? undefined : Number(body.amountCents),
      note: typeof body?.note === 'string' ? body.note : undefined,
    })
    return NextResponse.json({ ok: true, payment })
  } catch {
    return NextResponse.json({ ok: false, error: 'payment_failed' }, { status: 500 })
  }
}
