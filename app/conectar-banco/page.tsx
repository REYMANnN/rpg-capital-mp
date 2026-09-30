import Link from 'next/link'
import GoogleAuthButton from '@/components/accounts/GoogleAuthButton'
import ConnectBankPanel from '@/components/accounts/ConnectBankPanel'
import InAppBrowserNotice from '@/components/accounts/InAppBrowserNotice'
import { getAccountState, getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'
import { rafaWhatsAppLink } from '@/lib/invite-onboarding'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function Frame({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
    <div className="mx-auto w-full max-w-2xl">
      <p className="px-1 text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">{children}</section>
      <p className="mt-5 px-1 text-center text-xs leading-5 text-slate-500">A autorização acontece no seu banco pelo Open Finance. O BALCÃO não recebe sua senha e só consegue ler, nunca movimentar.</p>
    </div>
  </main>
}

export default async function ConnectBankPage({ searchParams }: { searchParams: Promise<{ loja?: string }> }) {
  const { loja: rawStore } = await searchParams
  const storeParam = rawStore && UUID.test(rawStore) ? rawStore : ''
  const here = storeParam ? `/conectar-banco?loja=${storeParam}` : '/conectar-banco'
  const switchAccount = `/auth/sair?next=${encodeURIComponent(here)}`
  const user = await getCurrentUser()

  if (!user) {
    return <Frame>
      <p className="text-sm font-semibold text-blue-700">Conectar banco</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Entre com a conta Google da loja</h1>
      <p className="mt-3 text-base leading-7 text-slate-600">Use a <b>mesma conta Google</b> que você usou para criar a conta no BALCÃO. Depois é só escolher o banco.</p>
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
      <h1 className="text-2xl font-bold tracking-tight">Essa conta Google não tem loja no BALCÃO</h1>
      <p className="mt-3 text-base leading-7 text-slate-600">Você entrou como <b>{email}</b>. Entre com a conta Google que você usou no cadastro da loja.</p>
      <a href={switchAccount} className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 font-semibold text-white">Trocar conta Google</a>
    </Frame>
  }

  const store = storeParam ? stores.find((row) => row.id === storeParam) : stores.length === 1 ? stores[0] : undefined

  if (storeParam && !store) {
    return <Frame>
      <h1 className="text-2xl font-bold tracking-tight">Essa conta Google não é a dessa loja</h1>
      <p className="mt-3 text-base leading-7 text-slate-600">Você entrou como <b>{email}</b>, que não tem acesso à loja deste link. Entre com a conta Google que você usou no cadastro.</p>
      <a href={switchAccount} className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 font-semibold text-white">Trocar conta Google</a>
    </Frame>
  }

  if (!store) {
    return <Frame>
      <h1 className="text-2xl font-bold tracking-tight">Qual loja vai conectar o banco?</h1>
      <div className="mt-6 grid gap-3">
        {stores.map((row) => <Link key={row.id} href={`/conectar-banco?loja=${row.id}`} className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 px-4 font-semibold hover:bg-slate-50">
          <span>{row.displayName}</span><span className="text-blue-700">Escolher →</span>
        </Link>)}
      </div>
    </Frame>
  }

  if (!['owner', 'admin', 'manager'].includes(store.role)) {
    return <Frame>
      <h1 className="text-2xl font-bold tracking-tight">Só o dono pode conectar o banco</h1>
      <p className="mt-3 text-base leading-7 text-slate-600">Peça para o dono da <b>{store.displayName}</b> abrir este link.</p>
    </Frame>
  }

  const number = process.env.RAFA_WHATSAPP_NUMBER?.trim() || undefined
  const whatsappHref = rafaWhatsAppLink(store.displayName, number).replace(/\?text=.*/, `?text=${encodeURIComponent('Conectei o banco!')}`)

  return <Frame>
    <p className="text-sm font-semibold text-blue-700">Conectar banco</p>
    <h1 className="mt-2 text-2xl font-bold tracking-tight">Banco da {store.displayName}</h1>
    <p className="mt-3 text-base leading-7 text-slate-600">Com o banco conectado, a Rafa mostra saldo, extrato e quanto entrou e saiu, direto no WhatsApp.</p>
    <ConnectBankPanel storeId={store.id} whatsappHref={whatsappHref} />
    <p className="mt-6 text-center text-xs text-slate-500">Entrou como {email} · <a href={switchAccount} className="font-semibold text-blue-700 underline underline-offset-4">trocar conta</a></p>
  </Frame>
}
