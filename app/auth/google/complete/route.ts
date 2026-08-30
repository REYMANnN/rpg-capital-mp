import { NextResponse } from 'next/server'
import { getAccountState, getCurrentUser } from '@/lib/accounts/currentUser'
import { destinationAfterLogin } from '@/lib/accounts/routing'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login?erro=google', url.origin))
  }

  const state = await getAccountState(user.id)
  return NextResponse.redirect(new URL(destinationAfterLogin(state), url.origin))
}
