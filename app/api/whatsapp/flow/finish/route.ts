import { NextRequest, NextResponse } from 'next/server'

import { BALCAO_SESSION_COOKIE, verifyBalcaoSessionToken } from '@/lib/deeplink'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatWhatsAppFlowSummary, type WhatsAppFlowSummary } from '@/lib/whatsapp-flow'
import { sendMenu } from '@/lib/whatsapp-menu'
import { sendText } from '@/lib/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type FinishBody = {
  status: 'success' | 'cancelled'
  summary?: WhatsAppFlowSummary
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(BALCAO_SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ ok: false, error: 'missing_session' }, { status: 401 })

  let claims
  try {
    claims = await verifyBalcaoSessionToken(token)
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_session' }, { status: 401 })
  }

  let body: FinishBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  if (body.status !== 'success' && body.status !== 'cancelled') {
    return NextResponse.json({ ok: false, error: 'invalid_status' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: session, error: sessionError } = await admin
    .from('whatsapp_sessions')
    .select('wa_id, fluxo_atual, expires_at')
    .eq('wa_id', claims.wa_id)
    .maybeSingle()
  if (sessionError || !session || new Date(session.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, error: 'expired_session' }, { status: 401 })
  }

  const text = body.status === 'cancelled'
    ? 'Operação cancelada.\n— Rafa'
    : body.summary
      ? formatWhatsAppFlowSummary(body.summary)
      : 'Pronto. Operação concluída.\n— Rafa'

  const sent = await sendText(claims.wa_id, text)
  if (!sent.ok) return NextResponse.json({ ok: false, error: sent.error }, { status: 502 })

  const menu = await sendMenu(claims.wa_id)
  if (!menu.ok) return NextResponse.json({ ok: false, error: menu.error }, { status: 502 })

  const now = new Date().toISOString()
  const { error: updateError } = await admin.from('whatsapp_sessions').update({
    fluxo_atual: null,
    etapa: 'menu',
    payload: {},
    updated_at: now,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }).eq('wa_id', claims.wa_id)
  if (updateError) return NextResponse.json({ ok: false, error: 'session_update_failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
