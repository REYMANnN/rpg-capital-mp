import { NextResponse } from 'next/server'
import { getAccountState, getCurrentUser } from '@/lib/accounts/currentUser'
import { destinationAfterLogin } from '@/lib/accounts/routing'
import { createClient as createServerClient } from '@/lib/supabase/server'

type AuthIntent = 'login' | 'signup'

function authIntent(url: URL): AuthIntent {
  return url.searchParams.get('intent') === 'signup' ? 'signup' : 'login'
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const intent = authIntent(url)
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.redirect(new URL(`/login?intent=${intent}&erro=google`, url.origin))
  }

  const state = await getAccountState(user.id)

  if (intent === 'login') {
    if (!state.onboarded || !state.hasBusiness) {
      const supabase = await createServerClient()
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/login?intent=login&erro=conta-nao-encontrada', url.origin))
    }

    return NextResponse.redirect(new URL(destinationAfterLogin(state), url.origin))
  }

  if (intent === 'signup') {
    if (state.onboarded && state.hasBusiness) {
      return NextResponse.redirect(new URL(destinationAfterLogin(state), url.origin))
    }

    return NextResponse.redirect(new URL('/onboarding', url.origin))
  }

  return NextResponse.redirect(new URL('/login', url.origin))
}
