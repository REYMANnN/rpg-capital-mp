import { createClient } from '@supabase/supabase-js'
import { getSupabaseUrl } from '@/lib/supabase/config'

export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')

  return createClient(
    getSupabaseUrl(),
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
