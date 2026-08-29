import Link from 'next/link'
import { redirect } from 'next/navigation'
import GoogleAuthButton from '@/components/accounts/GoogleAuthButton'
import { getAccountState, getCurrentUser } from '@/lib/accounts/currentUser'
import { destinationAfterLogin } from '@/lib/accounts/routing'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ intent?: string }> }) {
  const user = await getCurrentUser()
  if (user) redirect(destinationAfterLogin(await getAccountState(user.id)))

  const { intent } = await searchParams
  const choosing = intent !== 'login' && intent !== 'signup'

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
      <div className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center">
        <div className="mb-8">
          <p className="text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">{choosing ? 'Sua loja, sem complicação.' : intent === 'signup' ? 'Crie sua conta' : 'Entre no BALCÃO'}</h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            {choosing ? 'Estoque, vendas e gestão em um lugar simples.' : 'Use sua Conta Google. Você não precisa criar outra senha.'}
          </p>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-label="Acesso ao BALCÃO">
          {choosing ? (
            <div className="grid gap-3">
              <Link className="flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 py-3 text-base font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700" href="/login?intent=login">Entrar</Link>
              <Link className="flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-5 py-3 text-base font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700" href="/login?intent=signup">Criar conta</Link>
            </div>
          ) : (
            <>
              <GoogleAuthButton label={intent === 'signup' ? 'Criar com Google' : 'Continuar com Google'} />
              <Link href="/login" className="mt-5 block min-h-11 py-3 text-center text-sm font-semibold text-blue-700 underline-offset-4 hover:underline">Voltar</Link>
            </>
          )}
        </section>
        <p className="mt-6 text-center text-sm leading-6 text-slate-500">A Conta Google é usada somente para identificar e proteger o acesso de gestão.</p>
      </div>
    </main>
  )
}
