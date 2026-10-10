import { redirect } from 'next/navigation'

import SumUpConnectPanel from '@/components/accounts/SumUpConnectPanel'
import { getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'
import { safeNextPath } from '@/lib/accounts/routing'
import { getSumUpOnboarding, setSumUpOnboarding } from '@/lib/sumup/access'
import { listReaders } from '@/lib/sumup/charges'
import { sumupConnected, sumupSignupUrl } from '@/lib/sumup/client'

export const dynamic = 'force-dynamic'

// Etapa opcional do cadastro, depois do banco: conectar a maquininha (SumUp).
export default async function OnboardingCardPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams
  const next = safeNextPath(rawNext) || '/manage'
  const user = await getCurrentUser()
  if (!user) redirect(`/login?intent=login&next=${encodeURIComponent(`/onboarding/maquininha?next=${next}`)}`)
  const businesses = await getManagementContext(user.id)
  const store = businesses.flatMap((business) => business.stores.map((row) => ({ ...row, role: business.role })))[0]
  if (!store) redirect('/onboarding')
  if (!['owner', 'admin', 'manager'].includes(store.role)) redirect(next)

  const [connected, status, readers] = await Promise.all([sumupConnected(store.id), getSumUpOnboarding(store.id), listReaders(store.id)])
  if (connected && status !== 'connected') await setSumUpOnboarding(store.id, 'connected')
  if (status === 'skipped') redirect(next)

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
    <div className="mx-auto w-full max-w-2xl">
      <p className="px-1 text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-blue-700">Último passo (opcional)</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Maquininha de cartão</h1>
        <p className="mt-3 text-base leading-7 text-slate-600">Conecte sua conta SumUp para a Rafa mandar o valor direto pra maquininha (crédito, débito ou parcelado) e registrar a venda sozinha quando o cartão passar.</p>
        <SumUpConnectPanel storeId={store.id} connected={connected} readers={readers} signupUrl={sumupSignupUrl()} status={connected ? 'connected' : status} nextHref={next} onboarding />
      </section>
    </div>
  </main>
}
