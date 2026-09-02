import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncMalvoItem } from '@/lib/malvo/sync'
import { hashSecret, INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE, unpackCredential } from '@/lib/accounts/terminal'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
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
  const { data: connections, error: listError } = await admin.from('balcao_finance_connections')
    .select('provider_item_id,client_user_id,status')
    .eq('business_id', businessId)
    .eq('store_id', storeId)
    .eq('provider', 'malvo')
    .neq('status', 'disconnected')
  if (listError) return NextResponse.json({ error: 'Não foi possível carregar as conexões.' }, { status: 500 })

  const results = []
  for (const connection of connections || []) {
    try {
      results.push(await syncMalvoItem({ itemId: connection.provider_item_id, clientUserId: connection.client_user_id }))
    } catch (caught) {
      console.error('BALCAO manual Malvo sync failed', connection.provider_item_id, caught)
    }
  }

  return NextResponse.json({ ok: true, synced: results })
}
