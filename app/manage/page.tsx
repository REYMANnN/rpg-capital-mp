import { redirect } from 'next/navigation'
import ManageShell from '@/components/accounts/ManageShell'
import { getAccountState, getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'

export default async function ManagePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?intent=login')
  const state = await getAccountState(user.id)
  if (!state.onboarded) redirect('/onboarding')
  const businesses = await getManagementContext(user.id)
  if (!businesses.length) redirect('/onboarding')
  return <ManageShell userName={user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? 'Você'} businesses={businesses} />
}
