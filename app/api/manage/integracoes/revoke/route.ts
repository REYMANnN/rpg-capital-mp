import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessRole, getCurrentUser } from '@/lib/accounts/currentUser'

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL('/login?intent=login&next=/manage/integracoes', request.url), 303)

  const form = await request.formData()
  const grantId = String(form.get('grant_id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(grantId)) return NextResponse.redirect(new URL('/manage/integracoes', request.url), 303)

  const admin = createAdminClient()
  const { data: grant } = await admin.from('rpg_developer_grants').select('id,business_id,status').eq('id', grantId).maybeSingle()
  if (!grant) return NextResponse.redirect(new URL('/manage/integracoes', request.url), 303)

  const role = await getBusinessRole(user.id, grant.business_id)
  if (role !== 'owner' && role !== 'admin') return NextResponse.json({ error: { code: 'forbidden', message: 'Sem permissão para revogar esta conexão.' } }, { status: 403 })

  const { error } = await admin.from('rpg_developer_grants').update({ status: 'revoked', revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', grant.id)
  if (error) {
    console.error('developer grant revoke failed', error)
    return NextResponse.json({ error: { code: 'internal_error', message: 'Não foi possível revogar a conexão.' } }, { status: 500 })
  }

  return NextResponse.redirect(new URL('/manage/integracoes', request.url), 303)
}
