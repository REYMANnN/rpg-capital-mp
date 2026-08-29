import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAccountState } from '@/lib/accounts/currentUser'
import { destinationAfterLogin, safeNextPath } from '@/lib/accounts/routing'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const requestedNext = safeNextPath(url.searchParams.get('next'))
  if (!code) return NextResponse.redirect(new URL('/login?erro=google', url.origin))

  const supabase = await createServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL('/login?erro=google', url.origin))

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login?erro=google', url.origin))

  const state = await getAccountState(user.id)
  const defaultDestination = destinationAfterLogin(state)
  const destination = requestedNext && state.onboarded && state.hasBusiness ? requestedNext : defaultDestination
  const forwardedHost = request.headers.get('x-forwarded-host')
  const origin = forwardedHost && process.env.NODE_ENV !== 'development' ? `https://${forwardedHost}` : url.origin
  return NextResponse.redirect(new URL(destination, origin))
}
