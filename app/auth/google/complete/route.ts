import { NextResponse } from 'next/server'
import { getAccountState, getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'
import { getSumUpOnboarding } from '@/lib/sumup/access'
import { destinationAfterLogin, safeNextPath } from '@/lib/accounts/routing'
import { createClient as createServerClient } from '@/lib/supabase/server'

type AuthIntent = 'login' | 'signup'

function authIntent(url: URL): AuthIntent {
  return url.searchParams.get('intent') === 'signup' ? 'signup' : 'login'
}

// Quem parou na etapa da maquininha (ou foi criar a conta SumUp) volta direto pra ela.
async function resumeDestination(userId: string, state: { onboarded: boolean; hasBusiness: boolean }) {
  const destination = destinationAfterLogin(state)
  if (destination !== '/manage') return destination
  try {
    const store = (await getManagementContext(userId))[0]?.stores[0]
    const status = store ? await getSumUpOnboarding(store.id) : null
    if (status === 'pending' || status === 'signing_up') return '/onboarding/maquininha?next=/manage'
  } catch {}
  return destination
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const intent = authIntent(url)
  const next = safeNextPath(url.searchParams.get('next'))
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

    return NextResponse.redirect(new URL(next || await resumeDestination(user.id, state), url.origin))
  }

  if (intent === 'signup') {
    if (state.onboarded && state.hasBusiness) {
      return NextResponse.redirect(new URL(await resumeDestination(user.id, state), url.origin))
    }

    return NextResponse.redirect(new URL('/onboarding', url.origin))
  }

  return NextResponse.redirect(new URL('/login', url.origin))
}
