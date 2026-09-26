import { NextResponse } from 'next/server'
import { ADMIN_COOKIE } from '@/lib/admin/auth'

export const runtime = 'nodejs'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 0 })
  return response
}
