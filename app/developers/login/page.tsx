import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import DeveloperGoogleAuthButton from '@/components/developers/DeveloperGoogleAuthButton'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/accounts/currentUser'

export const metadata: Metadata = {
  title: 'Entrar — RPG for Developers',
  robots: { index: false, follow: false },
}

export default async function DeveloperLoginPage() {
  const user = await getCurrentUser()
  if (user) {
    const admin = createAdminClient()
    const { data } = await admin.from('rpg_developer_profiles').select('user_id').eq('user_id', user.id).maybeSingle()
    if (data) redirect('/developers')
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <div className="mx-auto flex min-h-[82vh] w-full max-w-md flex-col justify-center">
        <Link href="/integracoes" className="mb-8 text-sm font-semibold text-slate-300 hover:text-white">← Integrações</Link>
        <p className="text-sm font-bold tracking-[0.18em] text-blue-400">RPG FOR DEVELOPERS</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Construa sobre a RPG.</h1>
        <p className="mt-4 leading-7 text-slate-300">
          Esta é uma conta Developer separada da sua conta de lojista RPG. Você pode usar a mesma Conta Google sem misturar aplicativos, chaves ou autorizações.
        </p>
        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <DeveloperGoogleAuthButton />
          <p className="mt-5 text-xs leading-5 text-slate-500">O Google autentica sua identidade. As permissões sobre dados de lojas são concedidas separadamente por cada lojista.</p>
        </section>
      </div>
    </main>
  )
}
