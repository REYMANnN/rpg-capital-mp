import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin/auth'
import { createCoupon, deleteCoupon, normalizeCouponCode } from '@/lib/admin/coupons'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const denied = () => NextResponse.json({ ok: false, error: 'not_admin' }, { status: 401 })

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return denied()
  const body = await request.json().catch(() => null) as { note?: unknown } | null
  const note = typeof body?.note === 'string' ? body.note.trim() : ''
  const coupon = await createCoupon(note)
  return NextResponse.json({ ok: true, ...coupon })
}

export async function DELETE(request: NextRequest) {
  if (!isAdminRequest(request)) return denied()
  const code = normalizeCouponCode(request.nextUrl.searchParams.get('code'))
  if (!code) return NextResponse.json({ ok: false, error: 'invalid_code' }, { status: 400 })
  const deleted = await deleteCoupon(code)
  if (!deleted) return NextResponse.json({ ok: false, error: 'not_deletable' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
