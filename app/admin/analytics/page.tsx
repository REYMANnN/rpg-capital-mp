import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ADMIN_COOKIE, verifyAdminSession } from '@/lib/admin/auth'
import { loadWebAnalytics } from '@/lib/admin/webAnalytics'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Tráfego do site · RPG', robots: { index: false, follow: false } }

const num = (value: number) => value.toLocaleString('pt-BR')
const date = (value: string) => new Date(value).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-1 text-2xl font-bold text-slate-950">{value}</div>
    {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
  </div>
}

function List({ title, rows }: { title: string; rows: Array<{ name: string; count: number }> }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <h2 className="font-bold text-slate-950">{title}</h2>
    <div className="mt-3 space-y-2">
      {rows.length ? rows.map((row) => <div key={row.name} className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-slate-700">{row.name}</span>
        <strong>{num(row.count)}</strong>
      </div>) : <p className="text-sm text-slate-500">Sem dados ainda.</p>}
    </div>
  </div>
}

export default async function AnalyticsAdminPage() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value
  let allowed = false
  try { allowed = verifyAdminSession(token) } catch { allowed = false }
  if (!allowed) redirect('/admin')

  const data = await loadWebAnalytics()
  const funnelBase = Math.max(1, data.funnel7.landing)
  const pct = (value: number) => Math.round(value / funnelBase * 100)

  return <main className="min-h-screen bg-slate-100 pb-16 text-slate-950">
    <header className="bg-slate-950 px-4 py-5 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-emerald-400">RPG CAPITAL · TRÁFEGO</p>
          <h1 className="mt-1 text-xl font-bold">O que as pessoas fazem no site</h1>
          <p className="mt-1 text-xs text-white/55">Atualizado {date(data.generatedAt)} · somente visitantes que permitiram análise</p>
        </div>
        <a href="/admin" className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold">← Admin</a>
      </div>
    </header>

    <div className="mx-auto max-w-7xl px-4">
      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Visitantes hoje" value={num(data.d1.visitors)} hint={num(data.d1.sessions) + ' sessões'} />
        <Card label="Visitantes 7d" value={num(data.d7.visitors)} hint={num(data.d7.pageviews) + ' páginas vistas'} />
        <Card label="Visitantes 30d" value={num(data.d30.visitors)} hint={num(data.d30.sessions) + ' sessões'} />
        <Card label="Tempo ativo médio" value={num(data.avgActiveSeconds7) + 's'} hint="por sessão · 7 dias" />
        <Card label="Rejeição" value={data.bounceRate7 + '%'} hint="1 página e menos de 15s ativos" />
        <Card label="Chegaram na home" value={num(data.funnel7.landing)} hint="sessões · 7 dias" />
        <Card label="Clicaram interesse" value={num(data.funnel7.interestClick)} hint={pct(data.funnel7.interestClick) + '% da home'} />
        <Card label="Enviaram formulário" value={num(data.funnel7.formSubmit)} hint={pct(data.funnel7.formSubmit) + '% da home'} />
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-bold">Funil · últimos 7 dias</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[
            ['1. Home', data.funnel7.landing],
            ['2. Clicou em interesse', data.funnel7.interestClick],
            ['3. Começou formulário', data.funnel7.formStart],
            ['4. Enviou formulário', data.funnel7.formSubmit],
          ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold">{num(Number(value))}</p>
            <p className="text-xs text-slate-500">{pct(Number(value))}% de quem chegou à home</p>
          </div>)}
        </div>
      </section>

      <section className="mt-6 grid gap-3 md:grid-cols-3">
        <List title="De onde vieram" rows={data.sources7} />
        <List title="Dispositivos" rows={data.devices7} />
        <List title="Cidades aproximadas" rows={data.cities7} />
        <List title="Navegadores" rows={data.browsers7} />
        <List title="Sistemas" rows={data.os7} />
        <List title="Campanhas UTM" rows={data.campaigns7} />
        <List title="Páginas mais vistas" rows={data.pages7} />
        <List title="Mais clicados" rows={data.clickTargets7} />
        <List title="Onde o mouse ficou" rows={data.pointerSections7} />
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Mapa do mouse na home · 7 dias</h2>
          <p className="text-xs text-slate-500">{num(data.heatmap.points)} amostras · topo da página em cima</p>
        </div>
        <div className="mt-4 grid overflow-hidden rounded-xl border border-slate-200 bg-slate-50" style={{ gridTemplateColumns: 'repeat(16,minmax(0,1fr))' }}>
          {data.heatmap.cells.flatMap((row, y) => row.map((count, x) => {
            const intensity = data.heatmap.max ? count / data.heatmap.max : 0
            return <div
              key={x + '-' + y}
              title={count + ' amostras'}
              style={{
                aspectRatio: '1/1',
                background: count ? 'rgba(37,99,235,' + (0.10 + intensity * 0.85) + ')' : 'transparent',
                borderRight: '1px solid rgba(148,163,184,.08)',
                borderBottom: '1px solid rgba(148,163,184,.08)',
              }}
            />
          }))}
        </div>
        <div className="mt-2 grid gap-1 text-[11px] text-slate-500"><span>↑ Topo da página</span><span>↓ Fim da página</span></div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold">Sessões recentes</h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="p-3">Quando</th><th className="p-3">Pessoa / lead</th><th className="p-3">Origem</th><th className="p-3">Local</th><th className="p-3">Dispositivo</th><th className="p-3">Entrada</th><th className="p-3">Uso</th><th className="p-3">Funil</th></tr>
            </thead>
            <tbody>
              {data.recentSessions.map((s) => <tr key={s.id} className="border-t border-slate-100">
                <td className="p-3 whitespace-nowrap">{date(s.last)}</td>
                <td className="p-3">
                  {s.lead ? <div><strong>{s.lead.businessName || s.lead.name}</strong><div className="text-xs text-slate-500">{s.lead.name} · {s.lead.phone} · {s.lead.email}</div></div> : <span className="text-slate-400">Anônimo</span>}
                </td>
                <td className="p-3">{s.source}</td>
                <td className="p-3">{s.city !== '—' ? s.city + ' · ' + s.country : s.country}</td>
                <td className="p-3">{s.device}<div className="text-xs text-slate-500">{s.browser} · {s.os}</div></td>
                <td className="p-3">{s.landing}</td>
                <td className="p-3">{s.pages} pág. · {s.active}s ativos · scroll {s.maxScroll}%</td>
                <td className="p-3">
                  <span className={s.formSubmitted ? 'font-bold text-emerald-700' : s.formStarted ? 'font-bold text-amber-700' : s.interest ? 'font-bold text-blue-700' : 'text-slate-500'}>
                    {s.formSubmitted ? 'Formulário enviado' : s.formStarted ? 'Formulário iniciado' : s.interest ? 'Clicou interesse' : 'Só navegou'}
                  </span>
                </td>
              </tr>)}
              {!data.recentSessions.length ? <tr><td colSpan={8} className="p-6 text-center text-slate-500">Ainda não há sessões com consentimento.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </main>
}
