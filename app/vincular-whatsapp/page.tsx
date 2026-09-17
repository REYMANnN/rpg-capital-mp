import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'

type Params = { code?: string; erro?: string }

function errorMessage(code?: string) {
  if (code === 'expirado') return 'Esse código é inválido, já foi usado ou expirou. Peça um novo código pelo WhatsApp.'
  if (code === 'conta') return 'Não foi possível vincular esse WhatsApp à loja selecionada.'
  if (code === 'codigo') return 'Digite o código de 6 dígitos enviado pela RPG no WhatsApp.'
  return null
}

export default async function VincularWhatsAppPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const user = await getCurrentUser()

  if (!user) {
    const next = params.code ? `/vincular-whatsapp?code=${encodeURIComponent(params.code)}` : '/vincular-whatsapp'
    return (
      <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
        <div className="mx-auto flex min-h-[75vh] w-full max-w-md flex-col justify-center">
          <p className="text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
          <h1 className="mt-3 text-3xl font-bold">Vincular WhatsApp</h1>
          <p className="mt-3 leading-7 text-slate-600">Primeiro entre com a Conta Google que já administra sua loja no BALCÃO. Depois confirme o código de 6 dígitos enviado pelo WhatsApp.</p>
          <Link href={`/login?intent=login&next=${encodeURIComponent(next)}`} className="mt-7 flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white">Entrar no BALCÃO</Link>
        </div>
      </main>
    )
  }

  const businesses = await getManagementContext(user.id)
  if (!businesses.length) redirect('/onboarding')
  const message = errorMessage(params.erro)

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
      <div className="mx-auto flex min-h-[75vh] w-full max-w-md flex-col justify-center">
        <p className="text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
        <h1 className="mt-3 text-3xl font-bold">Vincular WhatsApp</h1>
        <p className="mt-3 leading-7 text-slate-600">Digite o código de 6 dígitos que a RPG enviou na conversa. O código expira em 15 minutos.</p>

        <form action="/api/balcao/whatsapp/link/confirm" method="post" className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {message ? <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-950">{message}</p> : null}
          <label htmlFor="code" className="block text-sm font-semibold">Código de 6 dígitos</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required defaultValue={params.code?.replace(/\D/g, '').slice(0, 6) ?? ''} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-lg tracking-[0.3em] outline-none focus:border-blue-700" />

          {businesses.length === 1 ? (
            <input type="hidden" name="businessId" value={businesses[0].id} />
          ) : (
            <div className="mt-5">
              <label htmlFor="businessId" className="block text-sm font-semibold">Loja / negócio</label>
              <select id="businessId" name="businessId" required className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4">
                {businesses.map((business) => <option key={business.id} value={business.id}>{business.displayName}</option>)}
              </select>
            </div>
          )}

          <button type="submit" className="mt-6 min-h-12 w-full rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800">Confirmar vínculo</button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">A confirmação exige acesso à conta que já administra o negócio. O número do WhatsApp sozinho não consegue assumir uma loja existente.</p>
      </div>
    </main>
  )
}
