import { createBrowserClient } from '@supabase/ssr'

const FALLBACK_URL = 'https://placeholder.supabase.co'
const FALLBACK_ANON_KEY = 'placeholder-anon-key'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || FALLBACK_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || FALLBACK_ANON_KEY

  return createBrowserClient(url, anonKey)
}
