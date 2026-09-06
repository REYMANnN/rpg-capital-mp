import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'
import { getBusinessBillingState } from '@/lib/billing/server'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?intent=login')
  const businesses = await getManagementContext(user.id)
  if (!businesses.length) redirect('/onboarding')

  const business = businesses[0]
  const billing = await getBusinessBillingState(business.id)
  const invoiceUrl = billing.invoiceUrl

  if (!billing.present) redirect('/manage')

  if (billing.allowed) {
    return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
      <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
        <h1 className="mt-5 text-3xl font-bold">Pagamento regularizado</h1>
        {billing.reconnectRequired ? <>
          <p className="mt-4 leading-7 text-slate-600">Seu acesso ao BALCÃO foi liberado. Por segurança e para impedir custos enquanto havia pagamento pendente, a conexão Open Finance foi desfeita.</p>
          <p className="mt-3 font-semibold text-slate-900">Reconecte sua conta bancária no BALCÃO para voltar a receber dados financeiros.</p>
        </> : <p className="mt-4 leading-7 text-slate-600">Sua assinatura está regular e o BALCÃO está liberado.</p>}
        <Link href="/manage" className="mt-7 inline-flex min-h-12 items-center rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white">Entrar no BALCÃO</Link>
      </section>
    </main>
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
    <section className="mx-auto max-w-xl rounded-3xl border border-rose-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
      <h1 className="mt-5 text-3xl font-bold">Pagamento pendente</h1>
      <p className="mt-4 leading-7 text-slate-600">O acesso de <strong>{business.displayName}</strong> está suspenso enquanto existir uma cobrança vencida. A conexão bancária da Malvo também foi desfeita para não gerar novos custos de Open Finance.</p>

      {invoiceUrl ? <a href={invoiceUrl} target="_blank" rel="noreferrer" className="mt-7 inline-flex min-h-12 items-center rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white">Pagar agora</a> : <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">A cobrança está pendente, mas o link de pagamento ainda não está disponível. Atualize esta página em instantes.</p>}

      <div className="mt-7 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        Depois que o Asaas confirmar o pagamento, o acesso ao BALCÃO volta automaticamente. Reconecte sua conta bancária manualmente depois de entrar; o BALCÃO não restaura consentimentos Open Finance sem sua autorização.
      </div>
      <Link href="/billing" className="mt-5 inline-flex min-h-11 items-center font-semibold text-blue-700">Já paguei — atualizar status</Link>
    </section>
  </main>
}
