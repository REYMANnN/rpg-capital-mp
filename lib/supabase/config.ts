export const DEFAULT_SUPABASE_URL = 'https://kftmhqugsswieuxqznfk.supabase.co'
export const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lgi_tCRVGcbVx5iHGeKDcQ_DUMSjXrH'

export function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL
}

export function getSupabasePublishableKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || DEFAULT_SUPABASE_PUBLISHABLE_KEY
}
