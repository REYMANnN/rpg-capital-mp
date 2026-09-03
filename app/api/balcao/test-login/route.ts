import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

const TEST_EMAIL = 'renanguadalupe05@gmail.com'
const TEST_TOKEN_HASH = '74f7ab0cbd67c8a0f54012ce69c50cf669a33dfe9b784428c5be442e'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const supabase = await createServerClient()

  const { data: current } = await supabase.auth.getUser()
  if (current.user?.email?.toLowerCase() === TEST_EMAIL) {
    return NextResponse.redirect(new URL('/manage', url.origin))
  }

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: TEST_TOKEN_HASH,
    type: 'email',
  })

  if (error || data.user?.email?.toLowerCase() !== TEST_EMAIL) {
    return NextResponse.redirect(new URL('/home?erro=teste-expirado', url.origin))
  }

  return NextResponse.redirect(new URL('/manage', url.origin))
}
