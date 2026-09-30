import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin/auth'
import { createInvite, revokeInvite } from '@/lib/admin/invites'
import { normalizeCouponCode } from '@/lib/admin/coupons'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const denied = () => NextResponse.json({ ok: false, error: 'not_admin' }, { status: 401 })

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return denied()
  const body = await request.json().catch(() => null) as { label?: unknown; inviteeName?: unknown; inviteePhone?: unknown; storeNameHint?: unknown } | null
  const inviteeName = typeof body?.inviteeName === 'string' ? body.inviteeName.trim() : ''
  try {
    const invite = await createInvite({
      label: typeof body?.label === 'string' ? body.label : '',
      inviteeName,
      inviteePhone: typeof body?.inviteePhone === 'string' ? body.inviteePhone : '',
      storeNameHint: typeof body?.storeNameHint === 'string' ? body.storeNameHint : '',
    })
    return NextResponse.json({ ok: true, ...invite })
  } catch {
    return NextResponse.json({ ok: false, error: 'invite_create_failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAdminRequest(request)) return denied()
  const code = normalizeCouponCode(request.nextUrl.searchParams.get('code'))
  if (!code) return NextResponse.json({ ok: false, error: 'invalid_code' }, { status: 400 })
  const revoked = await revokeInvite(code)
  if (!revoked) return NextResponse.json({ ok: false, error: 'not_revocable' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
