import { NextRequest, NextResponse } from 'next/server'
import { COUPON_COOKIE, normalizeCouponCode } from '@/lib/admin/coupons'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MESSAGES: Record<string, string> = {
  BALCAO_COUPON_INVALID: 'Cupom inválido ou já usado.',
  BALCAO_COUPON_ALREADY_BILLED: 'Sua conta já tem um plano ativo.',
  BALCAO_COUPON_FORBIDDEN: 'Só o dono da loja pode usar o cupom.',
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { storeId?: unknown; code?: unknown } | null
  const storeId = typeof body?.storeId === 'string' ? body.storeId : ''
  const code = normalizeCouponCode(body?.code)
  if (!storeId || !code) return NextResponse.json({ ok: false, error: 'Digite o cupom no formato RPG-XXXXXX.' }, { status: 400 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Entre na sua conta de novo.' }, { status: 401 })

  const { error } = await supabase.rpc('balcao_redeem_coupon', { p_store_id: storeId, p_code: code })
  if (error) {
    const key = Object.keys(MESSAGES).find((item) => error.message?.includes(item))
    return NextResponse.json({ ok: false, error: key ? MESSAGES[key] : 'Não consegui aplicar o cupom agora.' }, { status: key ? 409 : 500 })
  }
  const response = NextResponse.json({ ok: true })
  response.cookies.set(COUPON_COOKIE, '', { path: '/', maxAge: 0 })
  return response
}
