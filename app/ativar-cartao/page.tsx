import Link from 'next/link'

import GoogleAuthButton from '@/components/accounts/GoogleAuthButton'
import InAppBrowserNotice from '@/components/accounts/InAppBrowserNotice'
import TapToPaySetup from '@/components/accounts/TapToPaySetup'
import { getAccountState, getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'
import { rafaWhatsAppLink } from '@/lib/invite-onboarding'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function Frame({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
    <div className="mx-auto w-full max-w-2xl">
      <p className="px-1 text-sm font-bold tracking-[0.18em] text-blue-700">RPG · PAGAMENTOS</p>
      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">{children}</section>
    </div>
  </main>
}

export default async function TapToPayPage({ searchParams }: { searchParams: Promise<{ loja?: string }> }) {
  const { loja: rawStore } = await searchParams
  const storeParam = rawStore && UUID.test(rawStore) ? rawStore : ''
  const here = storeParam ? `/ativar-cartao?loja=${storeParam}` : '/ativar-cartao'
  const switchAccount = `/auth/sair?next=${encodeURIComponent(here)}`
  const user = await getCurrentUser()

  if (!user) {
    return <Frame>
      <p className="text-sm font-semibold text-blue-700">Ativar cartão</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Entre com a conta Google da loja</h1>
      <p className="mt-3 text-base leading-7 text-slate-600">Use a mesma conta Google da RPG. A configuração fica vinculada à loja certa.</p>
      <InAppBrowserNotice />
      <div className="mt-6"><GoogleAuthButton intent="login" next={here} label="Continuar com Google" /></div>
    </Frame>
  }

  const state = await getAccountState(user.id)
  const businesses = state.onboarded && state.hasBusiness ? await getManagementContext(user.id) : []
  const stores = businesses.flatMap((business) => business.stores.map((store) => ({ ...store, role: business.role })))
  const email = user.email || 'essa conta'

  if (!stores.length) {
    return <Frame>
      <h1 className="text-2xl font-bold tracking-tight">Essa conta não tem loja na RPG</h1>
      <p className="mt-3 text-slate-600">Você entrou como <b>{email}</b>.</p>
      <a href={switchAccount} className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 font-semibold text-white">Trocar conta Google</a>
    </Frame>
  }

  const store = storeParam ? stores.find((row) => row.id === storeParam) : stores.length === 1 ? stores[0] : undefined

  if (storeParam && !store) {
    return <Frame>
      <h1 className="text-2xl font-bold tracking-tight">Essa conta não tem acesso a esta loja</h1>
      <a href={switchAccount} className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 font-semibold text-white">Trocar conta Google</a>
    </Frame>
  }

  if (!store) {
    return <Frame>
      <h1 className="text-2xl font-bold tracking-tight">Qual loja vai ativar o cartão?</h1>
      <div className="mt-6 grid gap-3">
        {stores.map((row) => <Link key={row.id} href={`/ativar-cartao?loja=${row.id}`} className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 px-4 font-semibold hover:bg-slate-50">
          <span>{row.displayName}</span><span className="text-blue-700">Escolher →</span>
        </Link>)}
      </div>
    </Frame>
  }

  const number = process.env.RAFA_WHATSAPP_NUMBER?.trim() || undefined
  const whatsappHref = rafaWhatsAppLink(store.displayName, number).replace(/\?text=.*/, `?text=${encodeURIComponent('Cartão configurado!')}`)

  return <Frame>
    <p className="text-sm font-semibold text-blue-700">Tap to Pay</p>
    <h1 className="mt-2 text-2xl font-bold tracking-tight">Cartão na {store.displayName}</h1>
    <p className="mt-3 text-base leading-7 text-slate-600">Conecte a SumUp e instale o aplicativo RPG. Depois, quando escolher <b>Cartão</b> em uma venda da Rafa, a cobrança abre direto no Android.</p>
    <TapToPaySetup storeId={store.id} storeName={store.displayName} whatsappHref={whatsappHref} />
    <p className="mt-6 text-center text-xs text-slate-500">Entrou como {email} · <a href={switchAccount} className="font-semibold text-blue-700 underline underline-offset-4">trocar conta</a></p>
  </Frame>
}
