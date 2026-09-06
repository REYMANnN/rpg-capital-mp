import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createServerClient()
  await supabase.auth.signOut()

  const url = new URL(request.url)
  return NextResponse.redirect(new URL('/login?intent=signup', url.origin))
}
