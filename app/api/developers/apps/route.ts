import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/accounts/currentUser'

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: { code: 'unauthorized', message: 'Entre no RPG for Developers.' } }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('rpg_developer_profiles').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!profile) return NextResponse.json({ error: { code: 'developer_account_required', message: 'Crie sua conta Developer primeiro.' } }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  const websiteUrl = String(body.websiteUrl ?? '').trim() || null
  if (name.length < 2 || name.length > 100) return NextResponse.json({ error: { code: 'invalid_name', message: 'Use um nome entre 2 e 100 caracteres.' } }, { status: 400 })

  const { data, error } = await admin.from('rpg_developer_apps').insert({
    developer_user_id: user.id,
    name,
    website_url: websiteUrl,
  }).select('id,name,website_url,status,created_at').single()

  if (error) {
    console.error('developer app create failed', error)
    return NextResponse.json({ error: { code: 'internal_error', message: 'Não foi possível criar o aplicativo.' } }, { status: 500 })
  }
  return NextResponse.json({ data }, { status: 201 })
}
