import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2, CreditCard, Landmark, ShieldAlert } from 'lucide-react'
import { getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'
import { getBusinessBillingState, hasBillingAccess } from '@/lib/billing/access'

function money(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

export default async function BillingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?intent=login')
  const businesses = await getManagementContext(user.id)
  const business = businesses[0]
  if (!business) redirect('/onboarding')
  const billing = await getBusinessBillingState(business.id, user.email)
  const active = hasBillingAccess(billing)

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-7 px-1">
        <p className="text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Plano e pagamento</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{business.displayName}</p>
      </header>

      {billing.bypass ? <section className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex gap-4"><CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-600" /><div><h2 className="text-xl font-black">Conta de teste liberada</h2><p className="mt-2 text-sm leading-6 text-slate-600">Esta conta está no bypass de billing e não será enviada para o pagamento durante os testes.</p></div></div>
        <Link href="/manage" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">Entrar no BALCÃO</Link>
      </section> : <>
        <section className={`rounded-3xl border bg-white p-6 shadow-sm sm:p-8 ${active ? 'border-emerald-200' : 'border-amber-200'}`}>
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Seu plano</p>
              <h2 className="mt-2 text-2xl font-black">{billing.nextBankCount || 1} conta(s) bancária(s)</h2>
              <p className="mt-2 text-sm text-slate-600">R$ 5,99 por conta conectada por mês.</p>
            </div>
            <div className="text-right"><p className="text-3xl font-black">{money(billing.nextAmountCents || 599)}</p><p className="text-xs font-medium text-slate-500">próxima mensalidade</p></div>
          </div>
          <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4"><Landmark className="h-5 w-5 text-blue-700" /><p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Status</p><p className="mt-1 font-black">{active ? 'Ativo' : billing.status === 'pending_payment' ? 'Aguardando pagamento' : 'Pagamento pendente'}</p></div>
            <div className="rounded-2xl bg-slate-50 p-4"><CreditCard className="h-5 w-5 text-blue-700" /><p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Cobrança atual</p><p className="mt-1 font-black">{money(billing.currentAmountCents)}</p></div>
          </div>
        </section>

        {!active ? <section className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-6 sm:p-8">
          <div className="flex gap-4"><ShieldAlert className="h-7 w-7 shrink-0 text-amber-700" /><div><h2 className="text-xl font-black">Pagamento pendente</h2><p className="mt-2 text-sm leading-6 text-amber-950">O acesso operacional fica bloqueado até a confirmação financeira. Seus dados permanecem salvos.</p></div></div>
          <Link href="/onboarding" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-amber-900 px-5 py-3 text-sm font-bold text-white">Regularizar pagamento</Link>
        </section> : <div className="mt-5"><Link href="/manage" className="inline-flex min-h-11 items-center rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white">Voltar ao BALCÃO</Link></div>}
      </>}
    </div>
  </main>
}
