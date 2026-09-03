import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/config'

const TEST_EMAIL = 'renanguadalupe05@gmail.com'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const supabase = createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: {
      flowType: 'implicit',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const { error } = await supabase.auth.signInWithOtp({
    email: TEST_EMAIL,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${url.origin}/auth/test-complete`,
    },
  })

  if (error) {
    return NextResponse.json({ ok: false, error: 'temporary_login_email_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
