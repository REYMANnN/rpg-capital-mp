import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessRole, getStoreBusiness } from '@/lib/accounts/currentUser'
import { attachReservedBillingSlot } from '@/lib/billing/access'
import { isBillingBypassEmail } from '@/lib/billing/config'
import { hashSecret, INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE, unpackCredential } from '@/lib/accounts/terminal'
import { deleteMalvoItem } from '@/lib/malvo/client'
import { syncMalvoItemAsManagement } from '@/lib/malvo/managementSync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { storeId?: unknown; itemId?: unknown }
  const requestedStoreId = typeof body.storeId === 'string' ? body.storeId : ''
  const itemId = typeof body.itemId === 'string' ? body.itemId : ''
  if (!itemId) return NextResponse.json({ error: 'Conexão bancária não identificada.' }, { status: 400 })

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
    if (!role || !['owner', 'admin', 'manager'].includes(role)) {
      return NextResponse.json({ error: 'Somente a gestão pode conectar contas bancárias.' }, { status: 403 })
    }

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
      return NextResponse.json({ error: 'Não foi possível identificar a loja.' }, { status: 403 })
    }

    const source = data as Record<string, unknown>
    businessId = typeof source.businessId === 'string' ? source.businessId : ''
    storeId = typeof source.storeId === 'string' ? source.storeId : ''
    authorization = typeof source.authorization === 'string' ? source.authorization : ''
  }

  if (authorization !== 'google' || !businessId || !storeId) {
    return NextResponse.json({ error: 'Somente a conta principal pode conectar contas bancárias.' }, { status: 403 })
  }

  try {
    const result = await syncMalvoItemAsManagement({
      itemId,
      expectedBusinessId: businessId,
      expectedStoreId: storeId,
      supabase,
    })

    if (!isBillingBypassEmail(userEmail)) {
      const admin = createAdminClient()
      const { data: connection } = await admin.from('balcao_finance_connections')
        .select('id')
        .eq('business_id', businessId)
        .eq('provider', 'malvo')
        .eq('provider_item_id', itemId)
        .maybeSingle()
      const slotId = connection?.id ? await attachReservedBillingSlot(businessId, connection.id) : null
      if (!slotId) {
        await deleteMalvoItem(itemId).catch(() => undefined)
        if (connection?.id) await admin.from('balcao_finance_connections').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('id', connection.id)
        return NextResponse.json({ error: 'A autorização bancária expirou antes de concluir. Nenhuma conexão paga foi consumida; tente novamente.' }, { status: 409 })
      }
    }

    return NextResponse.json({ ok: true, result }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  } catch (caught) {
    console.error('BALCAO Malvo completion sync failed', caught)
    return NextResponse.json({ error: caught instanceof Error ? caught.message : 'Não foi possível salvar a conexão bancária.' }, { status: 502 })
  }
}
