import Link from 'next/link'
import TestGoogleLoginButton from '@/components/accounts/TestGoogleLoginButton'

export default function PublicHomePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
      <div className="mx-auto flex min-h-[82vh] w-full max-w-2xl items-center justify-center">
        <section className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
          <p className="text-sm font-bold tracking-[0.18em] text-blue-700">RPG CAPITAL</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">BALCÃO</h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-slate-600">
            Estoque, caixa e financeiro em um só lugar, feito para simplificar a gestão da sua loja.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            <Link
              href="/login?intent=login"
              className="flex min-h-14 items-center justify-center rounded-2xl bg-blue-700 px-6 py-4 text-base font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              Minha Conta
            </Link>
            <Link
              href="/login?intent=signup"
              className="flex min-h-14 items-center justify-center rounded-2xl border border-slate-300 bg-white px-6 py-4 text-base font-semibold text-slate-950 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              Criar Conta
            </Link>
          </div>

          <TestGoogleLoginButton />

          <p className="mt-8 text-sm leading-6 text-slate-500">
            O acesso de gestão usa sua Conta Google. Você não precisa criar outra senha.
          </p>
        </section>
      </div>
    </main>
  )
}
