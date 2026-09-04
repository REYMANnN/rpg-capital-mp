import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createMalvoConnectToken } from '@/lib/malvo/client'
import { getBusinessRole, getStoreBusiness } from '@/lib/accounts/currentUser'
import { releaseBillingReservation, reserveBillingSlot } from '@/lib/billing/access'
import { hashSecret, INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE, unpackCredential } from '@/lib/accounts/terminal'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { storeId?: unknown; returnTo?: unknown }
  const requestedStoreId = typeof body.storeId === 'string' ? body.storeId : ''
  const returnTo = body.returnTo === 'onboarding' ? 'onboarding' : 'finance'
  const supabase = await createServerClient()
  let businessId = ''
  let storeId = ''
  let authorization = ''
  let userEmail: string | null = null

  if (requestedStoreId) {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Entre com sua Conta Google para continuar.' }, { status: 401 })
    const store = await getStoreBusiness(requestedStoreId)
    if (!store) return NextResponse.json({ error: 'Loja não identificada.' }, { status: 404 })
    const role = await getBusinessRole(user.id, store.businessId)
    if (!role) return NextResponse.json({ error: 'Seu perfil não pode gerenciar esta loja.' }, { status: 403 })
    businessId = store.businessId
    storeId = requestedStoreId
    authorization = 'google'
    userEmail = user.email ?? null
  } else {
    const jar = await cookies()
    const terminal = unpackCredential(jar.get(TERMINAL_COOKIE)?.value)
    const session = unpackCredential(jar.get(STAFF_SESSION_COOKIE)?.value)
    const installationId = jar.get(INVENTORY_INSTALLATION_COOKIE)?.value ?? null

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
    authorization = typeof source.authorization === 'string' ? source.authorization : ''
    businessId = typeof source.businessId === 'string' ? source.businessId : ''
    storeId = typeof source.storeId === 'string' ? source.storeId : ''
  }

  if (authorization !== 'google') {
    return NextResponse.json({ error: 'Somente a conta principal pode conectar ou renovar consentimentos bancários.' }, { status: 403 })
  }
  if (!businessId || !storeId) return NextResponse.json({ error: 'Não foi possível identificar a loja.' }, { status: 400 })

  const entitlement = await reserveBillingSlot({ businessId, email: userEmail })
  if (!entitlement.bypass && !entitlement.slotId) {
    return NextResponse.json({ error: 'Esta conexão bancária ainda não foi paga. Ative uma conexão de R$ 5,99 antes de continuar.' }, { status: 402 })
  }

  try {
    const origin = new URL(request.url).origin
    const accessToken = await createMalvoConnectToken({
      businessId,
      storeId,
      webhookUrl: `${origin}/api/balcao/finance/malvo/webhook`,
      oauthRedirectUri: returnTo === 'onboarding' ? `${origin}/onboarding?step=bank` : `${origin}/inventory-v1?finance=connections`,
    })
    return NextResponse.json({ ok: true, accessToken, expiresIn: 1800 }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  } catch (caught) {
    if (!entitlement.bypass) await releaseBillingReservation(businessId, entitlement.slotId).catch(() => undefined)
    const message = caught instanceof Error ? caught.message : 'Malvo indisponível'
    const missingConfig = /MALVO_(CLIENT_ID|CLIENT_SECRET|WEBHOOK_SECRET) is not configured/.test(message)
    console.error('BALCAO Malvo connect-token failed', missingConfig ? 'missing_configuration' : caught)
    return NextResponse.json({
      error: missingConfig ? 'A integração bancária ainda não está configurada no servidor.' : 'Não foi possível iniciar a conexão bancária.',
    }, { status: missingConfig ? 503 : 502 })
  }
}
