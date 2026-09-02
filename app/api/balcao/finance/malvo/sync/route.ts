import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getBusinessRole, getStoreBusiness } from '@/lib/accounts/currentUser'
import { syncMalvoItemAsManagement } from '@/lib/malvo/managementSync'
import { hashSecret, INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE, unpackCredential } from '@/lib/accounts/terminal'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { storeId?: unknown }
  const requestedStoreId = typeof body.storeId === 'string' ? body.storeId : ''
  const supabase = await createServerClient()
  let businessId = ''
  let storeId = ''
  let authorization = ''

  if (requestedStoreId) {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Entre com sua Conta Google para continuar.' }, { status: 401 })
    const store = await getStoreBusiness(requestedStoreId)
    if (!store) return NextResponse.json({ error: 'Loja não identificada.' }, { status: 404 })
    const role = await getBusinessRole(user.id, store.businessId)
    if (!role || !['owner', 'admin', 'manager'].includes(role)) {
      return NextResponse.json({ error: 'Somente a gestão pode atualizar conexões bancárias.' }, { status: 403 })
    }
    businessId = store.businessId
    storeId = requestedStoreId
    authorization = 'google'
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
    businessId = typeof source.businessId === 'string' ? source.businessId : ''
    storeId = typeof source.storeId === 'string' ? source.storeId : ''
    authorization = typeof source.authorization === 'string' ? source.authorization : ''
  }

  if (!businessId || !storeId) return NextResponse.json({ error: 'Loja não identificada.' }, { status: 400 })
  if (authorization !== 'google') {
    return NextResponse.json({ error: 'Somente a conta principal pode atualizar conexões bancárias.' }, { status: 403 })
  }

  const { data, error: listError } = await supabase.rpc('balcao_list_finance_connections', {
    p_store_id: storeId,
    p_installation_id: null,
    p_terminal_id: null,
    p_terminal_hash: null,
    p_session_id: null,
    p_session_hash: null,
  })
  if (listError || !data || typeof data !== 'object') {
    return NextResponse.json({ error: 'Não foi possível carregar as conexões.' }, { status: 500 })
  }

  const payload = data as Record<string, unknown>
  const connections = Array.isArray(payload.connections) ? payload.connections as Array<Record<string, unknown>> : []
  const results = []

  for (const connection of connections) {
    if (connection.status === 'disconnected' || connection.provider !== 'malvo' || typeof connection.itemId !== 'string') continue
    try {
      results.push(await syncMalvoItemAsManagement({
        itemId: connection.itemId,
        expectedBusinessId: businessId,
        expectedStoreId: storeId,
        supabase,
      }))
    } catch (caught) {
      console.error('BALCAO manual Malvo sync failed', connection.itemId, caught)
    }
  }

  return NextResponse.json({ ok: true, synced: results })
}
