import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createMalvoConnectToken } from '@/lib/malvo/client'
import { hashSecret, INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE, unpackCredential } from '@/lib/accounts/terminal'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const jar = await cookies()
  const terminal = unpackCredential(jar.get(TERMINAL_COOKIE)?.value)
  const session = unpackCredential(jar.get(STAFF_SESSION_COOKIE)?.value)
  const installationId = jar.get(INVENTORY_INSTALLATION_COOKIE)?.value ?? null
  const supabase = await createServerClient()

  const { data, error } = await supabase.rpc('balcao_finance_dashboard_source', {
    p_installation_id: installationId,
    p_terminal_id: terminal?.id ?? null,
    p_terminal_hash: terminal ? hashSecret(terminal.secret) : null,
    p_session_id: session?.id ?? null,
    p_session_hash: session ? hashSecret(session.secret) : null,
    p_days: 7,
  })

  if (error || !data || typeof data !== 'object') {
    return NextResponse.json({ error: 'Seu perfil não tem acesso ao Financeiro.' }, { status: 403 })
  }

  const source = data as Record<string, unknown>
  if (source.authorization !== 'google') {
    return NextResponse.json({ error: 'Somente a conta principal pode conectar ou renovar consentimentos bancários.' }, { status: 403 })
  }

  const businessId = typeof source.businessId === 'string' ? source.businessId : ''
  const storeId = typeof source.storeId === 'string' ? source.storeId : ''
  if (!businessId || !storeId) {
    return NextResponse.json({ error: 'Não foi possível identificar a loja.' }, { status: 400 })
  }

  try {
    const origin = new URL(request.url).origin
    const accessToken = await createMalvoConnectToken({
      businessId,
      storeId,
      webhookUrl: `${origin}/api/balcao/finance/malvo/webhook`,
      oauthRedirectUri: `${origin}/inventory-v1?finance=connections`,
    })
    return NextResponse.json({ ok: true, accessToken, expiresIn: 1800 }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Malvo indisponível'
    const missingConfig = /MALVO_(CLIENT_ID|CLIENT_SECRET|WEBHOOK_SECRET) is not configured/.test(message)
    console.error('BALCAO Malvo connect-token failed', missingConfig ? 'missing_configuration' : caught)
    return NextResponse.json({
      error: missingConfig ? 'A integração bancária ainda não está configurada no servidor.' : 'Não foi possível iniciar a conexão bancária.',
    }, { status: missingConfig ? 503 : 502 })
  }
}
