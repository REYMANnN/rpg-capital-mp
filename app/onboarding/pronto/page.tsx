import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'
import { rafaWhatsAppLink } from '@/lib/invite-onboarding'
import OnboardingReadyQr from '@/components/accounts/OnboardingReadyQr'

export const dynamic = 'force-dynamic'

export default async function OnboardingReadyPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?intent=login')
  const businesses = await getManagementContext(user.id)
  const store = businesses[0]?.stores[0]
  if (!store) redirect('/onboarding')

  const firstName = String(user.user_metadata?.full_name || user.user_metadata?.name || '').trim().split(/\s+/)[0] || 'pronto'
  const number = process.env.RAFA_WHATSAPP_NUMBER?.trim() || '5511936201445'
  const href = rafaWhatsAppLink(store.displayName, number)

  return <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
    <div className="mx-auto flex min-h-[80vh] w-full max-w-3xl flex-col justify-center">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <p className="text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Sua conta está pronta, {firstName}! 🎉</h1>
        <p className="mt-3 text-base leading-7 text-slate-600">Agora fale com a Rafa para ela reconhecer sua loja e ajudar a montar seu estoque.</p>
        <div className="mt-8 grid gap-8 md:grid-cols-[1fr_230px] md:items-center">
          <div>
            <a href={href} target="_blank" rel="noreferrer" className="flex min-h-14 w-full items-center justify-center rounded-xl bg-emerald-600 px-6 py-4 text-center text-lg font-bold text-white hover:bg-emerald-700">Falar com a Rafa no WhatsApp</a>
            <Link href="/manage" className="mt-4 block text-center text-sm font-semibold text-blue-700 underline underline-offset-4">Ir para o painel da loja</Link>
          </div>
          <OnboardingReadyQr href={href} />
        </div>
      </section>
    </div>
  </main>
}
