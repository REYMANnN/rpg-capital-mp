import { NextResponse } from 'next/server'
import { getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  try {
    const businesses = await getManagementContext(user.id)
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null }, businesses })
  } catch {
    return NextResponse.json({ error: 'Não conseguimos carregar sua conta.' }, { status: 500 })
  }
}
