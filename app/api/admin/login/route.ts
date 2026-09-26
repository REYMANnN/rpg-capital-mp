import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, attemptAdminLogin, clientIp, createAdminSession } from '@/lib/admin/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { password?: unknown } | null
  const password = typeof body?.password === 'string' ? body.password : ''
  const result = await attemptAdminLogin(password, clientIp(request))
  if (!result.ok) {
    const status = result.error === 'blocked' ? 429 : result.error === 'not_configured' ? 503 : 401
    return NextResponse.json({ ok: false, error: result.error }, { status })
  }
  const response = NextResponse.json({ ok: true })
  response.cookies.set(ADMIN_COOKIE, createAdminSession(), { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: ADMIN_SESSION_SECONDS })
  return response
}
