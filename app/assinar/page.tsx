import { redirect } from 'next/navigation'
import OnboardingBillingStep from '@/components/accounts/OnboardingBillingStep'
import { getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Link que o lojista recebe quando a cortesia acaba: cadastra o cartão e passa a pagar R$ 9,99/mês.
export default async function AssinarPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?intent=login')
  const businesses = await getManagementContext(user.id)
  const business = businesses.find((item) => item.role === 'owner' || item.role === 'admin')
  const store = business?.stores[0]
  if (!business || !store) redirect('/onboarding')

  const supabase = await createServerClient()
  const { data: billing } = await supabase.from('balcao_billing_accounts').select('status').eq('business_id', business.id).maybeSingle()
  if (billing?.status === 'configured' || billing?.status === 'active') redirect('/manage')

  const userName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? ''
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
    <OnboardingBillingStep storeId={store.id} userName={userName} userEmail={user.email ?? ''} allowCoupon={false} successHref="/manage" stepLabel={false} />
  </main>
}
