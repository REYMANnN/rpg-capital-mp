import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import InviteOnboardingForm from '@/components/accounts/InviteOnboardingForm'
import OnboardingWizard from '@/components/accounts/OnboardingWizard'
import OnboardingBillingStep from '@/components/accounts/OnboardingBillingStep'
import OnboardingBankStep from '@/components/accounts/OnboardingBankStep'
import { getAccountState, getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'
import { COUPON_COOKIE, normalizeCouponCode } from '@/lib/admin/coupons'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?intent=signup')

  const jar = await cookies()
  const inviteCode = normalizeCouponCode(jar.get(COUPON_COOKIE)?.value)
  let invite: { code: string; status: string; revoked_at: string | null; redeemed_by: string | null; invitee_phone: string | null; store_name_hint: string | null } | null = null
  if (inviteCode) {
    const { data } = await createAdminClient().from('balcao_coupons')
      .select('code,status,revoked_at,redeemed_by,invitee_phone,store_name_hint')
      .eq('code', inviteCode)
      .maybeSingle()
    invite = data ? {
      code: String(data.code),
      status: String(data.status),
      revoked_at: data.revoked_at ? String(data.revoked_at) : null,
      redeemed_by: data.redeemed_by ? String(data.redeemed_by) : null,
      invitee_phone: data.invitee_phone ? String(data.invitee_phone) : null,
      store_name_hint: data.store_name_hint ? String(data.store_name_hint) : null,
    } : null
  }

  const inviteMode = Boolean(invite && !invite.revoked_at && (
    invite.status === 'available' || (invite.status === 'redeemed' && invite.redeemed_by === user.id)
  ))

  const state = await getAccountState(user.id)
  if (state.onboarded && state.hasBusiness) redirect('/manage')

  const userName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? ''
  if (!state.onboarded && state.hasBusiness) {
    const businesses = await getManagementContext(user.id)
    const store = businesses[0]?.stores[0]
    if (store) {
      if (inviteMode) {
        if (!state.billingConfigured) {
          return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
            <div className="mx-auto max-w-2xl rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
              <h1 className="text-xl font-bold">Não conseguimos ativar seu convite ainda.</h1>
              <p className="mt-2 text-sm">Volte ao formulário e tente novamente. Nenhum cartão será pedido.</p>
            </div>
          </main>
        }
        return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
          <OnboardingBankStep
            userName={userName}
            storeId={store.id}
            title="Último passo: conecte o banco da loja"
            successHref="/onboarding/maquininha?next=/onboarding/pronto"
            stepLabel={false}
          />
        </main>
      }

      if (!state.billingConfigured) {
        return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
          <OnboardingBillingStep storeId={store.id} userName={userName} userEmail={user.email ?? ''} />
        </main>
      }
      return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950"><OnboardingBankStep userName={userName} storeId={store.id} successHref="/onboarding/maquininha?next=/manage" /></main>
    }
  }

  if (inviteMode && invite) {
    return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <InviteOnboardingForm code={invite.code} storeNameHint={invite.store_name_hint} inviteePhone={invite.invitee_phone} />
    </main>
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
    <OnboardingWizard userName={userName} />
  </main>
}
