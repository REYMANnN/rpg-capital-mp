import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessRole, getCurrentUser } from '@/lib/accounts/currentUser'
import { normalizeDeveloperScopes } from '@/lib/platform/auth/developerKeys'

function hashToken(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL('/login?intent=login', request.url), 303)

  const form = await request.formData()
  const token = String(form.get('token') ?? '')
  const storeId = String(form.get('store_id') ?? '')
  const grantedScopes = normalizeDeveloperScopes(form.getAll('scopes'))
  if (!token || !storeId || !grantedScopes.length) return NextResponse.redirect(new URL(`/connect/${encodeURIComponent(token)}?erro=permissoes`, request.url), 303)

  const admin = createAdminClient()
  const { data: connection } = await admin
    .from('rpg_developer_connection_requests')
    .select('id,app_id,requested_scopes,external_reference,status,expires_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle()

  if (!connection || connection.status !== 'pending' || new Date(connection.expires_at).getTime() <= Date.now()) {
    return NextResponse.redirect(new URL('/connect/success?status=expired', request.url), 303)
  }

  const requested = new Set<string>((connection.requested_scopes ?? []) as string[])
  if (grantedScopes.some((scope) => !requested.has(scope))) {
    return NextResponse.json({ error: { code: 'invalid_scope', message: 'A autorização contém uma permissão que não foi solicitada.' } }, { status: 400 })
  }

  const { data: store } = await admin.from('inventory_v1_stores').select('id,business_id,active').eq('id', storeId).eq('active', true).maybeSingle()
  if (!store) return NextResponse.json({ error: { code: 'store_not_found', message: 'Loja inválida.' } }, { status: 400 })

  const role = await getBusinessRole(user.id, store.business_id)
  if (role !== 'owner' && role !== 'admin') return NextResponse.json({ error: { code: 'forbidden', message: 'Somente proprietário ou administrador pode autorizar uma integração.' } }, { status: 403 })

  const { data: claimed } = await admin
    .from('rpg_developer_connection_requests')
    .update({ status: 'consumed', consumed_at: new Date().toISOString() })
    .eq('id', connection.id)
    .eq('status', 'pending')
    .is('consumed_at', null)
    .select('id')
    .maybeSingle()

  if (!claimed) return NextResponse.redirect(new URL('/connect/success?status=expired', request.url), 303)

  const { data: grant, error } = await admin.from('rpg_developer_grants').insert({
    app_id: connection.app_id,
    business_id: store.business_id,
    store_id: store.id,
    authorized_by_user_id: user.id,
    scopes: grantedScopes,
    external_reference: connection.external_reference,
  }).select('id').single()

  if (error) {
    console.error('developer grant create failed', error)
    await admin.from('rpg_developer_connection_requests').update({ status: 'pending', consumed_at: null }).eq('id', connection.id)
    return NextResponse.json({ error: { code: 'internal_error', message: 'Não foi possível concluir a autorização.' } }, { status: 500 })
  }

  return NextResponse.redirect(new URL(`/connect/success?status=ok&connection_id=${grant.id}`, request.url), 303)
}
