import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import DeveloperDashboard from '@/components/developers/DeveloperDashboard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/accounts/currentUser'

export const metadata: Metadata = {
  title: 'Dashboard — RPG for Developers',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function DevelopersPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/developers/login')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('rpg_developer_profiles').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!profile) redirect('/developers/login')

  const { data: apps, error } = await admin
    .from('rpg_developer_apps')
    .select('id,name,website_url,status,created_at')
    .eq('developer_user_id', user.id)
    .order('created_at', { ascending: true })
  if (error) throw error

  const hydrated = await Promise.all((apps ?? []).map(async (app) => {
    const [{ data: secrets }, { data: grants }] = await Promise.all([
      admin.from('rpg_developer_secrets').select('id,name,prefix,scopes,created_at,last_used_at,revoked_at').eq('app_id', app.id).order('created_at', { ascending: false }),
      admin.from('rpg_developer_grants').select('id,business_id,store_id,scopes,status,external_reference,created_at').eq('app_id', app.id).order('created_at', { ascending: false }),
    ])
    return { ...app, secrets: secrets ?? [], grants: grants ?? [] }
  }))

  return <DeveloperDashboard initialApps={hydrated} />
}
