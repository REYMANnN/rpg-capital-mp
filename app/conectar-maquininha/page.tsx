import Link from 'next/link'

import GoogleAuthButton from '@/components/accounts/GoogleAuthButton'
import InAppBrowserNotice from '@/components/accounts/InAppBrowserNotice'
import SumUpConnectPanel from '@/components/accounts/SumUpConnectPanel'
import { getAccountState, getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'
import { rafaWhatsAppLink } from '@/lib/invite-onboarding'
import { getSumUpOnboarding } from '@/lib/sumup/access'
import { listReaders } from '@/lib/sumup/charges'
import { sumupConnected, sumupSignupUrl } from '@/lib/sumup/client'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ERRORS: Record<string, string> = {
  'sumup-indisponivel': 'A conexão com a SumUp ainda não está liberada. Tente mais tarde.',
  'sem-acesso': 'Essa conta Google não pode conectar a maquininha dessa loja.',
  'link-expirado': 'O login da SumUp demorou demais. Tente de novo.',
  'autorizacao-negada': 'A conexão foi cancelada na SumUp.',
  'outra-conta': 'Você voltou da SumUp com outra conta Google. Entre com a conta da loja e tente de novo.',
  'sem-codigo': 'A SumUp não devolveu a autorização. Tente de novo.',
  'falha-sumup': 'A SumUp não respondeu como esperado. Tente de novo em instantes.',
}

function Frame({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
    <div className="mx-auto w-full max-w-2xl">
      <p className="px-1 text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">{children}</section>
      <p className="mt-5 px-1 text-center text-xs leading-5 text-slate-500">O login acontece no site da SumUp. O BALCÃO não recebe sua senha.</p>
    </div>
  </main>
}

export default async function ConnectCardPage({ searchParams }: { searchParams: Promise<{ loja?: string; erro?: string; sumup?: string }> }) {
  const { loja: rawStore, erro, sumup } = await searchParams
  const storeParam = rawStore && UUID.test(rawStore) ? rawStore : ''
  const here = storeParam ? `/conectar-maquininha?loja=${storeParam}` : '/conectar-maquininha'
  const switchAccount = `/auth/sair?next=${encodeURIComponent(here)}`
  const user = await getCurrentUser()

  if (!user) {
    return <Frame>
      <p className="text-sm font-semibold text-blue-700">Conectar maquininha</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Entre com a conta Google da loja</h1>
      <p className="mt-3 text-base leading-7 text-slate-600">Use a <b>mesma conta Google</b> do cadastro no BALCÃO.</p>
      <InAppBrowserNotice />
      <div className="mt-6"><GoogleAuthButton intent="login" next={here} label="Continuar com Google" /></div>
    </Frame>
  }

  const state = await getAccountState(user.id)
  const businesses = state.onboarded && state.hasBusiness ? await getManagementContext(user.id) : []
  const stores = businesses.flatMap((business) => business.stores.map((store) => ({ ...store, role: business.role })))
  const store = storeParam ? stores.find((row) => row.id === storeParam) : stores.length === 1 ? stores[0] : undefined

  if (!stores.length || (storeParam && !store)) {
    return <Frame>
      <h1 className="text-2xl font-bold tracking-tight">Essa conta Google não é a dessa loja</h1>
      <p className="mt-3 text-base leading-7 text-slate-600">Você entrou como <b>{user.email}</b>. Entre com a conta Google que você usou no cadastro.</p>
      <a href={switchAccount} className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 font-semibold text-white">Trocar conta Google</a>
    </Frame>
  }

  if (!store) {
    return <Frame>
      <h1 className="text-2xl font-bold tracking-tight">Qual loja vai conectar a maquininha?</h1>
      <div className="mt-6 grid gap-3">
        {stores.map((row) => <Link key={row.id} href={`/conectar-maquininha?loja=${row.id}`} className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 px-4 font-semibold hover:bg-slate-50">
          <span>{row.displayName}</span><span className="text-blue-700">Escolher →</span>
        </Link>)}
      </div>
    </Frame>
  }

  if (!['owner', 'admin', 'manager'].includes(store.role)) {
    return <Frame>
      <h1 className="text-2xl font-bold tracking-tight">Só o dono pode conectar a maquininha</h1>
      <p className="mt-3 text-base leading-7 text-slate-600">Peça para o dono da <b>{store.displayName}</b> abrir este link.</p>
    </Frame>
  }

  const [connected, status, readers] = await Promise.all([sumupConnected(store.id), getSumUpOnboarding(store.id), listReaders(store.id)])
  const number = process.env.RAFA_WHATSAPP_NUMBER?.trim() || undefined
  const whatsappHref = rafaWhatsAppLink(store.displayName, number).replace(/\?text=.*/, `?text=${encodeURIComponent(readers.length ? 'Maquininha conectada!' : 'Conectei a SumUp!')}`)

  return <Frame>
    <p className="text-sm font-semibold text-blue-700">Conectar maquininha</p>
    <h1 className="mt-2 text-2xl font-bold tracking-tight">Maquininha da {store.displayName}</h1>
    <p className="mt-3 text-base leading-7 text-slate-600">Com a SumUp conectada, a Rafa manda o valor direto pra maquininha e registra a venda quando o cartão passar.</p>
    {erro && ERRORS[erro] ? <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800">{ERRORS[erro]}</p> : null}
    {sumup === 'conectada' ? <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">Pronto, conta SumUp conectada. Agora pareie a maquininha.</p> : null}
    <SumUpConnectPanel storeId={store.id} connected={connected} readers={readers} signupUrl={sumupSignupUrl()} status={connected ? 'connected' : status} whatsappHref={whatsappHref} />
    <p className="mt-6 text-center text-xs text-slate-500">Entrou como {user.email} · <a href={switchAccount} className="font-semibold text-blue-700 underline underline-offset-4">trocar conta</a></p>
  </Frame>
}
