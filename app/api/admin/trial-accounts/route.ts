import { NextRequest, NextResponse } from 'next/server'

import { isAdminRequest } from '@/lib/admin/auth'
import { createTrialAccount, deactivateTrialAccount, updateTrialAccount } from '@/lib/admin/trial-accounts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const denied = () => NextResponse.json({ ok: false, error: 'not_admin' }, { status: 401 })

function statusFor(error: string) {
  if (error === 'phone_already_linked') return 409
  if (error === 'trial_not_found') return 404
  if (error === 'save_failed') return 500
  return 400
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return denied()
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const result = await createTrialAccount({
    contactName: body?.contactName,
    businessName: body?.businessName,
    phone: body?.phone,
  })
  return NextResponse.json(result, { status: result.ok ? 201 : statusFor(result.error) })
}

export async function PATCH(request: NextRequest) {
  if (!isAdminRequest(request)) return denied()
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const businessId = typeof body?.businessId === 'string' ? body.businessId : ''
  const result = await updateTrialAccount(businessId, {
    contactName: body?.contactName,
    businessName: body?.businessName,
    phone: body?.phone,
  })
  return NextResponse.json(result, { status: result.ok ? 200 : statusFor(result.error) })
}

export async function DELETE(request: NextRequest) {
  if (!isAdminRequest(request)) return denied()
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const businessId = typeof body?.businessId === 'string' ? body.businessId : ''
  const result = await deactivateTrialAccount(businessId)
  return NextResponse.json(result, { status: result.ok ? 200 : statusFor(result.error) })
}
