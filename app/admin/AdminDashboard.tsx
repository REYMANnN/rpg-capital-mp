'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AdminMetrics } from '@/lib/admin/metrics'

const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: value > 0 && value < 1 ? 4 : 2, maximumFractionDigits: value > 0 && value < 1 ? 4 : 2 })
const cents = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const num = (value: number) => value.toLocaleString('pt-BR')
const date = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const BILLING_LABEL: Record<string, string> = {
  configured: 'Pagando',
  active: 'Pagando',
  courtesy: 'Cortesia',
  courtesy_ending: 'Cortesia acabando',
  pending_payment_method: 'Sem cartão',
  past_due: 'Atrasado',
  cancelled: 'Cancelado',
  sem_cobranca: 'Cadastro incompleto',
}
const BILLING_TONE: Record<string, string> = {
  configured: 'bg-emerald-100 text-emerald-800',
  active: 'bg-emerald-100 text-emerald-800',
  courtesy: 'bg-sky-100 text-sky-800',
  courtesy_ending: 'bg-amber-100 text-amber-800',
  past_due: 'bg-rose-100 text-rose-800',
}
const COUPON_LABEL: Record<string, string> = { available: 'Disponível', redeemed: 'Usado', cancelled: 'Cancelado' }

type Tab = 'geral' | 'cupons' | 'contas' | 'custos'

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-1 text-2xl font-bold text-slate-950">{value}</div>
    {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
  </div>
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="mt-6">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {action}
    </div>
    {children}
  </section>
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text) } catch {}
}

export default function AdminDashboard({ data }: { data: AdminMetrics }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('geral')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [created, setCreated] = useState<{ code: string; link: string } | null>(null)
  const [endResult, setEndResult] = useState<{ name: string; sent: boolean; message: string; error?: string | null } | null>(null)

  const o = data.overview
  const courtesyAccounts = data.accounts.filter((a) => a.billingStatus === 'courtesy' || a.billingStatus === 'courtesy_ending')

  async function createCoupon() {
    if (busy) return
    setBusy(true); setNotice('')
    const response = await fetch('/api/admin/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) })
    const body = await response.json().catch(() => ({})) as { code?: string; link?: string }
    setBusy(false)
    if (!response.ok || !body.code || !body.link) { setNotice('Não consegui criar o cupom.'); return }
    setCreated({ code: body.code, link: body.link })
    setNote('')
    router.refresh()
  }

  async function removeCoupon(code: string) {
    if (!confirm(`Apagar o cupom ${code}?`)) return
    const response = await fetch(`/api/admin/coupons?code=${encodeURIComponent(code)}`, { method: 'DELETE' })
    setNotice(response.ok ? `Cupom ${code} apagado.` : 'Só dá para apagar cupom que ainda não foi usado.')
    router.refresh()
  }

  async function courtesy(businessId: string, name: string, action: 'end' | 'reopen') {
    if (action === 'end' && !confirm(`Encerrar a cortesia de ${name}? A loja recebe no WhatsApp o link para cadastrar o cartão e tem 7 dias.`)) return
    setBusy(true); setNotice('')
    const response = await fetch('/api/admin/courtesy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId, action }) })
    const body = await response.json().catch(() => ({})) as { ok?: boolean; sent?: boolean; message?: string; sendError?: string | null }
    setBusy(false)
    if (!response.ok || !body.ok) { setNotice('Não deu certo. Atualize a página e tente de novo.'); return }
    if (action === 'end') setEndResult({ name, sent: Boolean(body.sent), message: body.message || '', error: body.sendError })
    else setNotice(`Cortesia de ${name} reaberta.`)
    router.refresh()
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.refresh()
  }

  const tabs: Array<[Tab, string]> = [['geral', 'Visão geral'], ['cupons', 'Cupons'], ['contas', 'Contas'], ['custos', 'Custos e uso']]

  return <main className="min-h-screen bg-slate-100 pb-16 text-slate-950">
    <header className="bg-slate-950 px-4 py-5 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-emerald-400">RPG CAPITAL · ADMIN</p>
          <p className="mt-1 text-sm text-white/60">Atualizado {date(data.generatedAt)}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.refresh()} className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold">Atualizar</button>
          <button onClick={logout} className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold">Sair</button>
        </div>
      </div>
      <nav className="mx-auto mt-4 flex max-w-6xl gap-2 overflow-x-auto">
        {tabs.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${tab === id ? 'bg-white text-slate-950' : 'bg-white/10 text-white'}`}>{label}</button>)}
      </nav>
    </header>

    <div className="mx-auto max-w-6xl px-4">
      {notice && <div className="mt-4 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">{notice}</div>}

      {tab === 'geral' && <>
        <Section title="Negócio">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card label="Contas" value={num(o.accounts)} hint={`+${o.accounts7} em 7 dias · +${o.accounts30} em 30`} />
            <Card label="Pagando" value={num(o.paying)} hint={`MRR ${cents(o.mrrCents)}`} />
            <Card label="Cortesia" value={num(o.courtesy)} hint={`${o.noBilling} com cadastro incompleto`} />
            <Card label="Lojas vendendo (7d)" value={num(o.activeStores7)} hint={`${num(o.stores)} lojas no total`} />
            <Card label="Usuários (Google)" value={num(o.users)} hint={`+${o.users7} em 7 dias`} />
            <Card label="Vendas (7d)" value={num(data.sales.count7)} hint={cents(data.sales.total7Cents)} />
            <Card label="Vendas (30d)" value={num(data.sales.count30)} hint={cents(data.sales.total30Cents)} />
            <Card label="Bancos (Malvo)" value={num(data.malvo.total)} hint={Object.entries(data.malvo.status).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'nenhum'} />
          </div>
        </Section>
        <Section title="Rafa (WhatsApp)">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card label="Mensagens recebidas hoje" value={num(data.whatsapp.inboundToday)} hint={`${num(data.whatsapp.inbound7)} em 7 dias`} />
            <Card label="Mensagens enviadas hoje" value={num(data.whatsapp.sentToday)} hint={`${num(data.whatsapp.sent7)} em 7 dias · ${num(data.whatsapp.failed7)} falharam`} />
            <Card label="Números ativos (7d)" value={num(data.whatsapp.activeNumbers7)} hint={`${num(data.whatsapp.linkedNumbers)} números ligados a lojas`} />
            <Card label="Custo IA hoje" value={brl(data.ai.today.brl)} hint={`${brl(data.ai.d30.brl)} em 30 dias`} />
          </div>
          <p className="mt-2 text-xs text-slate-500">Conexão do WhatsApp: {data.whatsapp.instances.map((i) => `${i.instance} ${i.state === 'open' ? 'conectado' : i.state} (${date(i.updatedAt)})`).join(' · ') || '—'}</p>
        </Section>
      </>}

      {tab === 'cupons' && <>
        <Section title="Criar cupom">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-600">Cada cupom vale para uma loja só. A loja usa sem cartão até você encerrar a cortesia.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Para quem é? (ex.: Mercado do Zé, feira SJC)" className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 outline-none focus:border-slate-900" />
              <button onClick={createCoupon} disabled={busy} className="min-h-12 rounded-xl bg-slate-950 px-5 font-bold text-white disabled:opacity-50">Gerar cupom</button>
            </div>
            {created && <div className="mt-4 rounded-xl bg-emerald-50 p-4">
              <p className="font-mono text-xl font-bold text-emerald-900">{created.code}</p>
              <p className="mt-1 break-all text-sm text-emerald-900">{created.link}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => copy(created.link)} className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Copiar link</button>
                <a href={`https://wa.me/?text=${encodeURIComponent(`Oi! Aqui está seu acesso à RPG, sem custo para começar: ${created.link}`)}`} target="_blank" rel="noreferrer" className="rounded-full border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800">Mandar no WhatsApp</a>
              </div>
            </div>}
          </div>
        </Section>

        <Section title="Lojas em cortesia">
          {endResult && <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
            <p className="font-bold text-amber-900">{endResult.sent ? `Mensagem enviada para ${endResult.name}.` : `Não consegui mandar no WhatsApp de ${endResult.name}${endResult.error ? ` (${endResult.error})` : ''}. Mande você:`}</p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-amber-900">{endResult.message}</pre>
            <button onClick={() => copy(endResult.message)} className="mt-2 rounded-full bg-amber-700 px-4 py-2 text-sm font-semibold text-white">Copiar mensagem</button>
          </div>}
          {!courtesyAccounts.length ? <p className="text-sm text-slate-500">Nenhuma loja em cortesia.</p> :
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Loja</th><th className="p-3">Cupom</th><th className="p-3">Situação</th><th className="p-3"></th></tr></thead>
                <tbody>{courtesyAccounts.map((a) => <tr key={a.businessId} className="border-t border-slate-100">
                  <td className="p-3 font-semibold">{a.name}<div className="text-xs font-normal text-slate-500">{a.phone || 'sem telefone'}</div></td>
                  <td className="p-3 font-mono">{a.couponCode || '—'}</td>
                  <td className="p-3">{a.billingStatus === 'courtesy_ending' ? `Cartão até ${date(a.courtesyEndsAt)}` : 'Grátis, sem prazo'}</td>
                  <td className="p-3 text-right">{a.billingStatus === 'courtesy'
                    ? <button disabled={busy} onClick={() => courtesy(a.businessId, a.name, 'end')} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white">Encerrar cortesia</button>
                    : <button disabled={busy} onClick={() => courtesy(a.businessId, a.name, 'reopen')} className="rounded-full border border-slate-300 px-4 py-2 text-xs font-bold">Reabrir cortesia</button>}</td>
                </tr>)}</tbody>
              </table>
            </div>}
        </Section>

        <Section title={`Todos os cupons (${data.coupons.length})`}>
          {!data.coupons.length ? <p className="text-sm text-slate-500">Nenhum cupom ainda.</p> :
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Cupom</th><th className="p-3">Para</th><th className="p-3">Status</th><th className="p-3">Criado</th><th className="p-3"></th></tr></thead>
                <tbody>{data.coupons.map((c) => <tr key={c.code} className="border-t border-slate-100">
                  <td className="p-3 font-mono font-semibold">{c.code}</td>
                  <td className="p-3">{c.note || '—'}{c.businessName && <div className="text-xs text-slate-500">Usado por {c.businessName} em {date(c.redeemedAt)}</div>}</td>
                  <td className="p-3">{COUPON_LABEL[c.status] || c.status}</td>
                  <td className="p-3">{date(c.createdAt)}</td>
                  <td className="p-3 text-right">{c.status === 'available' && <div className="flex justify-end gap-2">
                    <button onClick={() => copy(c.link)} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold">Copiar link</button>
                    <button onClick={() => removeCoupon(c.code)} className="rounded-full border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700">Apagar</button>
                  </div>}</td>
                </tr>)}</tbody>
              </table>
            </div>}
        </Section>
      </>}

      {tab === 'contas' && <Section title={`Contas (${data.accounts.length})`}>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Loja</th><th className="p-3">Criada</th><th className="p-3">Cobrança</th><th className="p-3">Banco</th><th className="p-3">Rafa</th><th className="p-3">Vendas 30d</th></tr></thead>
            <tbody>{data.accounts.map((a) => <tr key={a.businessId} className="border-t border-slate-100">
              <td className="p-3 font-semibold">{a.name}<div className="text-xs font-normal text-slate-500">{a.phone || 'sem telefone'}</div></td>
              <td className="p-3">{date(a.createdAt)}</td>
              <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${BILLING_TONE[a.billingStatus] || 'bg-slate-100 text-slate-700'}`}>{BILLING_LABEL[a.billingStatus] || a.billingStatus}</span></td>
              <td className="p-3">{a.bank || '—'}</td>
              <td className="p-3">{a.rafaNumbers ? `${a.rafaNumbers} número(s)` : '—'}</td>
              <td className="p-3">{num(a.sales30d)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </Section>}

      {tab === 'custos' && <>
        <Section title="IA da Rafa">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Card label="Hoje" value={brl(data.ai.today.brl)} hint={`${num(data.ai.today.calls)} chamadas · ${num(data.ai.today.input + data.ai.today.output)} tokens`} />
            <Card label="7 dias" value={brl(data.ai.d7.brl)} hint={`${num(data.ai.d7.calls)} chamadas · ${num(data.ai.d7.input + data.ai.d7.output)} tokens`} />
            <Card label="30 dias" value={brl(data.ai.d30.brl)} hint={`${num(data.ai.d30.calls)} chamadas · ${num(data.ai.d30.input + data.ai.d30.output)} tokens`} />
          </div>
          <p className="mt-2 text-xs text-slate-500">Convertido de dólar a R$ {data.fx.rate.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {data.fx.live ? '(cotação do dia)' : '(cotação aproximada, a consulta falhou)'}.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-bold">Por tipo (30 dias)</p>
              {data.ai.byOperation.map((row) => <div key={row.operation} className="mt-2 flex justify-between text-sm"><span>{row.operation} · {num(row.calls)}x</span><span className="font-semibold">{brl(row.brl)}</span></div>)}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-bold">Por loja (30 dias)</p>
              {data.ai.byStore.map((row) => <div key={row.name} className="mt-2 flex justify-between text-sm"><span>{row.name}</span><span className="font-semibold">{brl(row.brl)}</span></div>)}
            </div>
          </div>
        </Section>
        <Section title="WhatsApp">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card label="Enviadas (7d)" value={num(data.whatsapp.sent7)} hint={`${num(data.whatsapp.read7)} lidas`} />
            <Card label="Falharam (7d)" value={num(data.whatsapp.failed7)} hint={`${num(data.whatsapp.pending)} na fila agora`} />
            <Card label="Recebidas (7d)" value={num(data.whatsapp.inbound7)} />
            <Card label="Links (7d)" value={num(data.whatsapp.links7)} hint={`${num(data.whatsapp.linksOpened7)} abertos`} />
          </div>
        </Section>
        <Section title="Bancos (Malvo)">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
            <p>{num(data.malvo.total)} conexão(ões) · {Object.entries(data.malvo.status).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'nenhuma'}</p>
            {data.malvo.problems.length > 0 && <div className="mt-3">
              <p className="font-bold text-amber-800">Precisam de atenção</p>
              {data.malvo.problems.map((p, i) => <div key={i} className="mt-2 rounded-xl bg-amber-50 p-3"><b>{p.name}</b> · {p.bank} · {p.status}<div className="text-xs text-slate-600">Última atualização: {date(p.lastSync)}{p.error ? ` · ${p.error}` : ''}</div></div>)}
            </div>}
          </div>
        </Section>
        <p className="mt-6 text-xs text-slate-500">Custos fixos (Vercel, Supabase, servidor do WhatsApp no Google Cloud) não aparecem aqui: esses serviços não informam o custo para o site.</p>
      </>}
    </div>
  </main>
}
