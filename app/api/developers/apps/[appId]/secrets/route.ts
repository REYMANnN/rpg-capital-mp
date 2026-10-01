import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/accounts/currentUser'
import { generateDeveloperSecret, normalizeDeveloperScopes } from '@/lib/platform/auth/developerKeys'

export async function POST(request: Request, { params }: { params: Promise<{ appId: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: { code: 'unauthorized', message: 'Entre no RPG for Developers.' } }, { status: 401 })

  const { appId } = await params
  const admin = createAdminClient()
  const { data: app } = await admin.from('rpg_developer_apps').select('id').eq('id', appId).eq('developer_user_id', user.id).eq('status', 'active').maybeSingle()
  if (!app) return NextResponse.json({ error: { code: 'not_found', message: 'Aplicativo não encontrado.' } }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const scopes = normalizeDeveloperScopes(body.scopes)
  const name = String(body.name ?? 'Default').trim().slice(0, 80) || 'Default'
  if (!scopes.length) return NextResponse.json({ error: { code: 'scopes_required', message: 'Selecione pelo menos uma permissão.' } }, { status: 400 })

  const credential = generateDeveloperSecret()
  const { data, error } = await admin.from('rpg_developer_secrets').insert({
    app_id: appId,
    name,
    prefix: credential.prefix,
    secret_hash: credential.secretHash,
    scopes,
  }).select('id,name,prefix,scopes,created_at').single()

  if (error) {
    console.error('developer secret create failed', error)
    return NextResponse.json({ error: { code: 'internal_error', message: 'Não foi possível gerar a chave.' } }, { status: 500 })
  }

  return NextResponse.json({ data: { ...data, api_key: credential.token, warning: 'Esta chave será mostrada somente agora. Salve-a em local seguro.' } }, { status: 201, headers: { 'cache-control': 'no-store' } })
}
