import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/accounts/currentUser'

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL('/developers/login?erro=google', request.url))

  const admin = createAdminClient()
  const displayName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.slice(0, 120) : null
  const { error } = await admin.from('rpg_developer_profiles').upsert(
    { user_id: user.id, display_name: displayName, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (error) {
    console.error('developer profile upsert failed', error)
    return NextResponse.redirect(new URL('/developers/login?erro=conta', request.url))
  }
  return NextResponse.redirect(new URL('/developers', request.url))
}
