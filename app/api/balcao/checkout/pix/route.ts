import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { buildStaticPixPayload } from '@/lib/payments/pix'
import { hashSecret, STAFF_SESSION_COOKIE, TERMINAL_COOKIE, unpackCredential } from '@/lib/accounts/terminal'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const amountCents = Number(body?.amountCents)
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_000) {
    return NextResponse.json({ error: 'Informe um valor válido para a cobrança Pix.' }, { status: 400 })
  }

  const terminal = unpackCredential(request.cookies.get(TERMINAL_COOKIE)?.value)
  const session = unpackCredential(request.cookies.get(STAFF_SESSION_COOKIE)?.value)
  if (!terminal || !session) {
    return NextResponse.json({ error: 'Entre como funcionário para cobrar no Pix.' }, { status: 401 })
  }

  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('balcao_checkout_pix_context', {
    p_terminal_id: terminal.id,
    p_terminal_hash: hashSecret(terminal.secret),
    p_session_id: session.id,
    p_session_hash: hashSecret(session.secret),
  })

  if (error) {
    console.error('BALCAO checkout Pix context failed', { code: error.code })
    return NextResponse.json({ error: 'Não conseguimos preparar a cobrança Pix agora.' }, { status: 500 })
  }

  const context = Array.isArray(data) ? data[0] : data
  if (!context) {
    return NextResponse.json({ error: 'Seu perfil não tem permissão para cobrar vendas.' }, { status: 403 })
  }
  if (!context.pix_key) {
    return NextResponse.json({ error: 'Esta loja ainda não possui uma chave Pix configurada.' }, { status: 409 })
  }

  try {
    const payload = buildStaticPixPayload({
      pixKey: String(context.pix_key),
      amountCents,
      merchantName: String(context.merchant_name || 'BALCAO'),
      merchantCity: String(context.merchant_city || 'BRASIL'),
    })
    const qrDataUrl = await QRCode.toDataURL(payload, {
      width: 420,
      margin: 2,
      errorCorrectionLevel: 'M',
    })

    return NextResponse.json({ ok: true, amountCents, payload, qrDataUrl })
  } catch {
    return NextResponse.json({ error: 'A chave Pix cadastrada não pôde gerar uma cobrança.' }, { status: 422 })
  }
}
