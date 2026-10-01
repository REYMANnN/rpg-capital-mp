import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/accounts/currentUser'
import { generateConnectionToken, normalizeDeveloperScopes } from '@/lib/platform/auth/developerKeys'

function hashToken(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export async function POST(request: Request, { params }: { params: Promise<{ appId: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: { code: 'unauthorized', message: 'Entre no RPG for Developers.' } }, { status: 401 })

  const { appId } = await params
  const admin = createAdminClient()
  const { data: app } = await admin.from('rpg_developer_apps').select('id').eq('id', appId).eq('developer_user_id', user.id).eq('status', 'active').maybeSingle()
  if (!app) return NextResponse.json({ error: { code: 'not_found', message: 'Aplicativo não encontrado.' } }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const requestedScopes = normalizeDeveloperScopes(body.scopes)
  if (!requestedScopes.length) return NextResponse.json({ error: { code: 'scopes_required', message: 'Selecione pelo menos uma permissão.' } }, { status: 400 })

  const token = generateConnectionToken()
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  const { data, error } = await admin.from('rpg_developer_connection_requests').insert({
    app_id: appId,
    token_hash: hashToken(token),
    requested_scopes: requestedScopes,
    external_reference: String(body.externalReference ?? '').trim().slice(0, 200) || null,
    expires_at: expiresAt,
  }).select('id,requested_scopes,expires_at').single()

  if (error) {
    console.error('connection request create failed', error)
    return NextResponse.json({ error: { code: 'internal_error', message: 'Não foi possível gerar o link.' } }, { status: 500 })
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || new URL(request.url).origin
  return NextResponse.json({ data: { ...data, connect_url: `${origin}/connect/${token}` } }, { status: 201, headers: { 'cache-control': 'no-store' } })
}
