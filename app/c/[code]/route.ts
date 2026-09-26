import { NextRequest, NextResponse } from 'next/server'
import { COUPON_COOKIE, normalizeCouponCode } from '@/lib/admin/coupons'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Link do cupom: rpgcapital.com.br/c/RPG-XXXXXX. Guarda o cupom e leva para criar a conta.
export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code: raw } = await context.params
  const code = normalizeCouponCode(raw)
  let valid = false
  if (code) {
    const { data } = await createAdminClient().from('balcao_coupons').select('status').eq('code', code).maybeSingle()
    valid = data?.status === 'available'
  }
  const response = NextResponse.redirect(new URL(valid ? '/login?intent=signup' : '/login?intent=signup&cupom=invalido', request.url))
  if (valid && code) {
    response.cookies.set(COUPON_COOKIE, code, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 })
  }
  return response
}
