import { NextRequest, NextResponse } from 'next/server'

import { BALCAO_SESSION_COOKIE, BALCAO_SESSION_TTL_SECONDS, createBalcaoSessionToken, redeemBalcaoDeepLink } from '@/lib/deeplink'
import { createAdminClient } from '@/lib/supabase/admin'
import { isBalcaoFlow } from '@/lib/whatsapp-flows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, context: { params: Promise<{ flow: string }> }) {
  const { flow } = await context.params
  const token = request.nextUrl.searchParams.get('t') || ''
  if (!isBalcaoFlow(flow) || !token) return NextResponse.redirect(new URL('/inventory-v1?wa_link_error=invalid', request.url))

  try {
    const admin = createAdminClient()
    const claims = await redeemBalcaoDeepLink(token, flow, async (candidate) => {
      const { error } = await admin.from('whatsapp_deeplink_jtis').insert({
        jti: candidate.jti,
        wa_id: candidate.wa_id,
        fluxo: candidate.fluxo,
        expires_at: new Date(candidate.exp * 1000).toISOString(),
      })
      if (!error) return true
      return error.code !== '23505' ? Promise.reject(error) : false
    })

    const { data: previousSession } = await admin.from('whatsapp_sessions')
      .select('payload')
      .eq('wa_id', claims.wa_id)
      .maybeSingle()
    const previousPayload = previousSession?.payload && typeof previousSession.payload === 'object'
      ? previousSession.payload as Record<string, unknown>
      : {}
    const invoiceImportId = claims.fluxo === 'prateleira' && typeof previousPayload.invoice_import_id === 'string'
      ? previousPayload.invoice_import_id
      : null

    const expiresAt = new Date(Date.now() + BALCAO_SESSION_TTL_SECONDS * 1000).toISOString()
    const sessionRow: Record<string, unknown> = {
      wa_id: claims.wa_id,
      fluxo_atual: claims.fluxo,
      etapa: invoiceImportId ? 'conferencia_nota' : 'aberto',
      payload: { jti: claims.jti, ...(invoiceImportId ? { invoice_import_id: invoiceImportId } : {}) },
      updated_at: new Date().toISOString(),
      expires_at: expiresAt,
    }
    if (claims.store_id) sessionRow.store_id = claims.store_id
    const { error: sessionError } = await admin.from('whatsapp_sessions').upsert(sessionRow, { onConflict: 'wa_id' })
    if (sessionError) throw sessionError

    const sessionToken = await createBalcaoSessionToken(claims)
    const destination = invoiceImportId
      ? `/rafa/prateleira?rafa_invoice=${encodeURIComponent(invoiceImportId)}`
      : `/inventory-v1?wa_flow=${claims.fluxo}`
    const response = NextResponse.redirect(new URL(destination, request.url))
    response.cookies.set(BALCAO_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: BALCAO_SESSION_TTL_SECONDS,
    })
    return response
  } catch (error: any) {
    const code = error?.message === 'link_reused' ? 'used' : error?.code === 'ERR_JWT_EXPIRED' ? 'expired' : 'invalid'
    return NextResponse.redirect(new URL(`/inventory-v1?wa_link_error=${code}`, request.url))
  }
}
