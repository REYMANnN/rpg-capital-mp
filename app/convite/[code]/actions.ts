'use server'

import { cookies } from 'next/headers'
import { COUPON_COOKIE, normalizeCouponCode } from '@/lib/admin/coupons'
import { createAdminClient } from '@/lib/supabase/admin'

export async function openInvite(rawCode: string) {
  const code = normalizeCouponCode(rawCode)
  if (!code) return { ok: false as const }
  const admin = createAdminClient()
  const { data } = await admin.from('balcao_coupons').select('status,revoked_at,opened_at').eq('code', code).maybeSingle()
  if (!data || data.status !== 'available' || data.revoked_at) return { ok: false as const }

  if (!data.opened_at) {
    await admin.from('balcao_coupons').update({ opened_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('code', code).eq('status', 'available').is('revoked_at', null).is('opened_at', null)
  }

  const jar = await cookies()
  jar.set(COUPON_COOKIE, code, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 })
  return { ok: true as const }
}
