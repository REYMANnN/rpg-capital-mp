import { NextRequest, NextResponse } from 'next/server'

import {
  BALCAO_SESSION_COOKIE,
  BALCAO_SESSION_TTL_SECONDS,
  createBalcaoSessionFromShortLink,
  readShortLink,
} from '@/lib/deeplink'
import { createAdminClient } from '@/lib/supabase/admin'

// Cada fluxo abre a ferramenta feita para o WhatsApp (app/r/*).
const TOOL_PATH: Record<string, string> = {
  vender: '/r/vender',
  'ler-codigo': '/r/ler',
  prateleira: '/r/prateleira',
  entrada: '/r/entrada',
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Link curto da Rafa: /l/<code>. Vale enquanto for o link mais recente do número
// e o fluxo não tiver sido encerrado no Balcão. Pode ser aberto mais de uma vez.
export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params
  const fail = (reason: string) => NextResponse.redirect(new URL(`/inventory-v1?wa_link_error=${reason}`, request.url))

  try {
    const link = await readShortLink(code)
    if (!link) return fail('invalid')
    if (link.revoked_at) return fail(link.revoked_reason === 'finished' ? 'finished' : 'replaced')
    if (!link.store_id) return fail('no_store')

    const admin = createAdminClient()
    const { data: previousSession } = await admin.from('whatsapp_sessions')
      .select('payload')
      .eq('wa_id', link.wa_id)
      .maybeSingle()
    const previousPayload = previousSession?.payload && typeof previousSession.payload === 'object'
      ? previousSession.payload as Record<string, unknown>
      : {}
    const invoiceImportId = link.fluxo === 'prateleira' && typeof previousPayload.invoice_import_id === 'string'
      ? previousPayload.invoice_import_id
      : null

    const now = new Date().toISOString()
    const { error: sessionError } = await admin.from('whatsapp_sessions').upsert({
      wa_id: link.wa_id,
      store_id: link.store_id,
      fluxo_atual: link.fluxo,
      etapa: invoiceImportId ? 'conferencia_nota' : 'aberto',
      payload: { jti: link.code, ...(invoiceImportId ? { invoice_import_id: invoiceImportId } : {}) },
      updated_at: now,
      expires_at: new Date(Date.now() + BALCAO_SESSION_TTL_SECONDS * 1000).toISOString(),
    }, { onConflict: 'wa_id' })
    if (sessionError) throw sessionError
    await admin.from('wa_links').update({ opened_at: now }).eq('code', link.code).is('opened_at', null)

    const sessionToken = await createBalcaoSessionFromShortLink(link)
    const destination = invoiceImportId
      ? `/rafa/prateleira?rafa_invoice=${encodeURIComponent(invoiceImportId)}`
      : TOOL_PATH[link.fluxo] || `/inventory-v1?wa_flow=${link.fluxo}`
    const response = NextResponse.redirect(new URL(destination, request.url))
    response.cookies.set(BALCAO_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: BALCAO_SESSION_TTL_SECONDS,
    })
    return response
  } catch (error) {
    console.error('Balcao short link failed', error instanceof Error ? error.message : error)
    return fail('invalid')
  }
}
