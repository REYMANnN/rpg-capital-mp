import 'server-only'

import { ADMIN_COOKIE, verifyAdminSession, verifyPasswordHash } from './core'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Painel de admin da RPG (/admin): uma senha só, guardada como hash scrypt em rpg_admin_settings.
// A sessão é um cookie assinado (HMAC) que vale 12h.

// Hash scrypt da senha administrativa definida pelo proprietário. A senha em si nunca fica no código.
const ADMIN_PASSWORD_HASH = 'scrypt$16384$8$1$W+WNbSsWWJwD6ZlhvBhkWgdCSixsHXo3XM9E0U/QF3c=$57jxglrUmU0PjPbEPFQnHEXxVun6wa2OERzHgI4qs4cVqbwPrl6y5Oq9T1GJtIdB2T1Vm1vvI26zGuPRXcquBg=='

export { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, createAdminSession, verifyAdminSession, verifyPasswordHash } from './core'

const IP_WINDOW_MS = 15 * 60 * 1000
const IP_MAX_FAILURES = 5
const GLOBAL_WINDOW_MS = 60 * 60 * 1000
const GLOBAL_MAX_FAILURES = 30

export function isAdminRequest(request: NextRequest) {
  try {
    return verifyAdminSession(request.cookies.get(ADMIN_COOKIE)?.value)
  } catch {
    return false
  }
}

export function clientIp(request: NextRequest) {
  return (request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown').trim().slice(0, 64)
}

export type LoginResult = { ok: true } | { ok: false; error: 'blocked' | 'wrong_password' | 'not_configured' }

export async function attemptAdminLogin(password: string, ip: string): Promise<LoginResult> {
  const admin = createAdminClient()
  const now = Date.now()
  const [{ count: ipFailures }, { count: globalFailures }] = await Promise.all([
    admin.from('rpg_admin_login_attempts').select('id', { count: 'exact', head: true })
      .eq('ip', ip).eq('ok', false).gte('created_at', new Date(now - IP_WINDOW_MS).toISOString()),
    admin.from('rpg_admin_login_attempts').select('id', { count: 'exact', head: true })
      .eq('ok', false).gte('created_at', new Date(now - GLOBAL_WINDOW_MS).toISOString()),
  ])
  if ((ipFailures ?? 0) >= IP_MAX_FAILURES || (globalFailures ?? 0) >= GLOBAL_MAX_FAILURES) return { ok: false, error: 'blocked' }

  const ok = typeof password === 'string' && password.length > 0 && password.length <= 200 && verifyPasswordHash(password, ADMIN_PASSWORD_HASH)
  await admin.from('rpg_admin_login_attempts').insert({ ip, ok })
  return ok ? { ok: true } : { ok: false, error: 'wrong_password' }
}
