import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashSecret, INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE, unpackCredential } from '@/lib/accounts/terminal'

export const dynamic = 'force-dynamic'

export async function GET() {
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
  const businessId = typeof source.businessId === 'string' ? source.businessId : ''
  const storeId = typeof source.storeId === 'string' ? source.storeId : ''
  if (!businessId || !storeId) return NextResponse.json({ error: 'Loja não identificada.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: rows, error: listError } = await admin.from('balcao_finance_connections')
    .select('id,provider,provider_item_id,institution_name,institution_logo_url,status,execution_status,consent_expires_at,last_synced_at,last_error_code,last_error_message,created_at,updated_at')
    .eq('business_id', businessId)
    .eq('store_id', storeId)
    .order('updated_at', { ascending: false })

  if (listError) {
    console.error('BALCAO finance connections failed', listError)
    return NextResponse.json({ error: 'Não foi possível carregar as conexões bancárias.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.MALVO_CLIENT_ID?.trim() && process.env.MALVO_CLIENT_SECRET?.trim() && process.env.MALVO_WEBHOOK_SECRET?.trim()),
    canManage: source.authorization === 'google',
    connections: (rows || []).map((row) => ({
      id: row.id,
      provider: row.provider,
      itemId: row.provider_item_id,
      institutionName: row.institution_name,
      institutionLogoUrl: row.institution_logo_url,
      status: row.status,
      executionStatus: row.execution_status,
      consentExpiresAt: row.consent_expires_at,
      lastSyncedAt: row.last_synced_at,
      errorCode: row.last_error_code,
      errorMessage: row.last_error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
