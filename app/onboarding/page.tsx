import { redirect } from 'next/navigation'
import OnboardingWizard from '@/components/accounts/OnboardingWizard'
import { getAccountState, getCurrentUser } from '@/lib/accounts/currentUser'

export default async function OnboardingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?intent=signup')
  const state = await getAccountState(user.id)
  if (state.onboarded && state.hasBusiness) redirect('/manage')

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <OnboardingWizard userName={user.user_metadata?.full_name ?? user.user_metadata?.name ?? ''} />
    </main>
  )
}
