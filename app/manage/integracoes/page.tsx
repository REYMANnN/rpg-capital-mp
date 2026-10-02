import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'

export const metadata: Metadata = {
  title: 'Integrações conectadas — RPG',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function ManagedIntegrationsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?intent=login&next=/manage/integracoes')

  const businesses = (await getManagementContext(user.id)).filter((item) => item.role === 'owner' || item.role === 'admin')
  const businessIds = businesses.map((item) => item.id)
  const admin = createAdminClient()

  const { data: grants } = businessIds.length
    ? await admin.from('rpg_developer_grants').select('id,app_id,business_id,store_id,scopes,status,created_at,revoked_at').in('business_id', businessIds).order('created_at', { ascending: false })
    : { data: [] as any[] }

  const appIds = [...new Set((grants ?? []).map((grant) => grant.app_id))]
  const storeIds = [...new Set((grants ?? []).map((grant) => grant.store_id))]
  const [{ data: apps }, { data: stores }] = await Promise.all([
    appIds.length ? admin.from('rpg_developer_apps').select('id,name,website_url').in('id', appIds) : Promise.resolve({ data: [] as any[] }),
    storeIds.length ? admin.from('inventory_v1_stores').select('id,display_name').in('id', storeIds) : Promise.resolve({ data: [] as any[] }),
  ])

  const appMap = new Map((apps ?? []).map((app) => [app.id, app]))
  const storeMap = new Map((stores ?? []).map((store) => [store.id, store.display_name]))
  const businessMap = new Map(businesses.map((business) => [business.id, business.displayName]))

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
      <div className="mx-auto max-w-4xl">
        <Link href="/manage" className="text-sm font-semibold text-slate-600">← Conta RPG</Link>
        <p className="mt-8 text-sm font-bold tracking-[0.18em] text-blue-700">INTEGRAÇÕES</p>
        <h1 className="mt-3 text-3xl font-bold">Aplicativos conectados</h1>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">Veja quem pode acessar suas lojas, quais permissões foram concedidas e revogue qualquer conexão quando quiser.</p>

        <section className="mt-8 grid gap-4">
          {!grants?.length ? <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">Nenhuma integração conectada.</div> : grants.map((grant) => {
            const app = appMap.get(grant.app_id)
            const active = grant.status === 'active'
            return (
              <article key={grant.id} className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">{app?.name ?? 'Aplicativo RPG'}</h2>
                    <p className="mt-1 text-sm text-slate-500">{businessMap.get(grant.business_id)} — {storeMap.get(grant.store_id) ?? 'Loja'}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{active ? 'ATIVA' : 'REVOGADA'}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">{(grant.scopes as string[]).map((scope) => <code key={scope} className="rounded-lg bg-slate-100 px-2 py-1 text-xs">{scope}</code>)}</div>
                {active ? (
                  <form action="/api/manage/integracoes/revoke" method="post" className="mt-5">
                    <input type="hidden" name="grant_id" value={grant.id} />
                    <button className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50">Revogar acesso</button>
                  </form>
                ) : null}
              </article>
            )
          })}
        </section>
      </div>
    </main>
  )
}
