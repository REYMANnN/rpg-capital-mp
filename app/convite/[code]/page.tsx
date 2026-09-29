import type { Metadata } from 'next'
import { normalizeCouponCode } from '@/lib/admin/coupons'
import { createAdminClient } from '@/lib/supabase/admin'
import InviteGoogleStart from './InviteGoogleStart'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Convite · Balcão RPG', robots: { index: false, follow: false } }

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params
  const code = normalizeCouponCode(rawCode)
  const { data } = code
    ? await createAdminClient().from('balcao_coupons').select('invitee_name,status,revoked_at').eq('code', code).maybeSingle()
    : { data: null }

  const valid = Boolean(data && data.status === 'available' && !data.revoked_at)
  return <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
    <div className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center">
      <p className="text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO · RPG CAPITAL</p>
      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {valid && code ? <>
          <h1 className="text-3xl font-bold tracking-tight">Oi{data?.invitee_name ? `, ${String(data.invitee_name)}` : ''}! Seu acesso ao Balcão está pronto.</h1>
          <p className="mt-3 text-base leading-7 text-slate-600">Leva poucos minutos. Você entra com Google, cadastra a loja e conecta o banco. Não precisa de cartão.</p>
          <div className="mt-7"><InviteGoogleStart code={code} /></div>
        </> : <>
          <h1 className="text-2xl font-bold tracking-tight">Esse convite não vale mais.</h1>
          <p className="mt-3 text-base leading-7 text-slate-600">Fala com quem te mandou.</p>
        </>}
      </section>
    </div>
  </main>
}
