import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  hashSecret,
  INVENTORY_INSTALLATION_COOKIE,
  makeSecret,
  packCredential,
  STAFF_SESSION_COOKIE,
  STAFF_SESSION_MAX_MS,
  TERMINAL_COOKIE,
} from '@/lib/accounts/terminal'

const bodySchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  pin: z.string().regex(/^\d{4}$/),
})

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const input = bodySchema.safeParse(await request.json().catch(() => null))
  if (!input.success || !token || token.length < 24) {
    return NextResponse.json({ error: 'Informe seu nome e o PIN de 4 números.' }, { status: 400 })
  }

  const terminalSecret = makeSecret()
  const sessionSecret = makeSecret()
  const expiresAt = new Date(Date.now() + STAFF_SESSION_MAX_MS).toISOString()
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('balcao_staff_access_login', {
    p_token: token,
    p_display_name: input.data.displayName,
    p_pin: input.data.pin,
    p_terminal_hash: hashSecret(terminalSecret),
    p_session_hash: hashSecret(sessionSecret),
    p_user_agent: request.headers.get('user-agent') ?? '',
    p_session_expires_at: expiresAt,
  })

  if (error) {
    return NextResponse.json({ error: 'Não conseguimos entrar agora. Tente novamente.' }, { status: 500 })
  }

  const row = Array.isArray(data) ? data[0] : data
  const status = row?.login_status
  if (status !== 'OK') {
    if (status === 'INVALID_LINK') return NextResponse.json({ error: 'Este link não está mais disponível.' }, { status: 410 })
    if (status === 'INVALID_NAME') return NextResponse.json({ error: 'Confira o nome informado.' }, { status: 401 })
    if (status === 'INVALID_PIN') return NextResponse.json({ error: 'PIN incorreto.' }, { status: 401 })
    if (status === 'PIN_LOCKED') return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco e tente novamente.' }, { status: 429 })
    return NextResponse.json({ error: 'Confira seu nome e o PIN.' }, { status: 400 })
  }

  if (!row?.terminal_id || !row?.session_id || !row?.installation_id) {
    return NextResponse.json({ error: 'Não conseguimos concluir o acesso.' }, { status: 500 })
  }

  const response = NextResponse.json({
    ok: true,
    staff: { id: row.staff_id, displayName: row.staff_name, role: row.staff_role },
    storeName: row.store_name,
  })
  response.cookies.set(TERMINAL_COOKIE, packCredential(row.terminal_id, terminalSecret), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  })
  response.cookies.set(STAFF_SESSION_COOKIE, packCredential(row.session_id, sessionSecret), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: STAFF_SESSION_MAX_MS / 1000,
  })
  response.cookies.set(INVENTORY_INSTALLATION_COOKIE, row.installation_id, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365 * 2,
  })
  return response
}
