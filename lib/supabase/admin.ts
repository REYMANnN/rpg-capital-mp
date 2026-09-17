import { createClient } from '@supabase/supabase-js'
import { getSupabaseUrl } from '@/lib/supabase/config'

export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!secret) {
    throw new Error('SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is not configured')
  }

  return createClient(getSupabaseUrl(), secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
