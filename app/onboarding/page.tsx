import { redirect } from 'next/navigation'
import OnboardingWizard from '@/components/accounts/OnboardingWizard'
import OnboardingBillingStep from '@/components/accounts/OnboardingBillingStep'
import OnboardingBankStep from '@/components/accounts/OnboardingBankStep'
import { getAccountState, getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'
import { getBusinessBillingState, hasBillingAccess } from '@/lib/billing/access'

export default async function OnboardingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?intent=signup')
  const state = await getAccountState(user.id)
  if (state.onboarded && state.hasBusiness) redirect('/manage')

  const userName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? ''
  if (!state.onboarded && state.hasBusiness) {
    const businesses = await getManagementContext(user.id)
    const business = businesses[0]
    const store = business?.stores[0]
    if (business && store) {
      const billing = await getBusinessBillingState(business.id, user.email)
      if (!hasBillingAccess(billing)) {
        return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950"><OnboardingBillingStep businessId={business.id} userName={userName} /></main>
      }
      return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950"><OnboardingBankStep userName={userName} storeId={store.id} /></main>
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <OnboardingWizard userName={userName} />
    </main>
  )
}
