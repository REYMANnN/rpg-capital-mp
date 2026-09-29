'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AdminMetrics } from '@/lib/admin/metrics'
import { billingMessage, inviteMessage, inviteWhatsAppUrl } from '@/lib/admin/invite-core'

const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: value > 0 && value < 1 ? 4 : 2, maximumFractionDigits: value > 0 && value < 1 ? 4 : 2 })
const cents = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const num = (value: number) => value.toLocaleString('pt-BR')
const date = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const dateOnly = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

type Tab = 'convites' | 'contas' | 'custos'

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

function Timeline({ invite }: { invite: AdminMetrics['coupons'][number] }) {
  const steps = [
    ['Criado', true],
    ['Aberto', Boolean(invite.openedAt)],
    ['Conta criada', Boolean(invite.redeemedAt)],
    ['Banco conectado', invite.bankConnected],
    ['Falou com a Rafa', invite.rafaWelcomed],
    ['Pagando', invite.paying],
  ] as Array<[string, boolean]>
  return <div className="flex min-w-[520px] items-center gap-1 text-[11px]">
    {steps.map(([label, done], index) => <div key={label} className="flex items-center gap-1">
      {index > 0 && <span className={done ? 'text-emerald-500' : 'text-slate-300'}>→</span>}
      <span className={done ? 'font-bold text-emerald-700' : 'text-slate-400'}>{done ? '●' : '○'} {label}</span>
    </div>)}
  </div>
}

export default function AdminDashboard({ data }: { data: AdminMetrics }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('convites')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [inviteeName, setInviteeName] = useState('')
  const [inviteePhone, setInviteePhone] = useState('')
  const [storeNameHint, setStoreNameHint] = useState('')
  const [created, setCreated] = useState<{ name: string; phone: string | null; link: string } | null>(null)
  const [pixKey, setPixKey] = useState(data.settings.pixKey)
  const [planPrice, setPlanPrice] = useState((data.settings.planPriceCents / 100).toFixed(2).replace('.', ','))

  async function createInvite() {
    if (busy || !inviteeName.trim()) return
    setBusy(true); setNotice('')
    const response = await fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteeName, inviteePhone, storeNameHint }),
    })
    const body = await response.json().catch(() => ({})) as { link?: string; inviteeName?: string; inviteePhone?: string | null }
    setBusy(false)
    if (!response.ok || !body.link) { setNotice('Não consegui criar o convite.'); return }
    setCreated({ name: body.inviteeName || inviteeName.trim(), phone: body.inviteePhone || null, link: body.link })
    setInviteeName(''); setInviteePhone(''); setStoreNameHint('')
    router.refresh()
  }

  async function revokeInvite(code: string) {
    if (!confirm(`Revogar o convite ${code}?`)) return
    const response = await fetch(`/api/admin/coupons?code=${encodeURIComponent(code)}`, { method: 'DELETE' })
    setNotice(response.ok ? `Convite ${code} revogado.` : 'Só dá para revogar convite que ainda não foi usado.')
    router.refresh()
  }

  async function saveSettings() {
    const value = Number(planPrice.replace(',', '.'))
    const planPriceCents = Math.round(value * 100)
    if (!(planPriceCents > 0)) { setNotice('Informe um valor mensal válido.'); return }
    setBusy(true); setNotice('')
    const response = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pixKey, planPriceCents }),
    })
    setBusy(false)
    setNotice(response.ok ? 'Configuração de cobrança salva.' : 'Não consegui salvar a configuração.')
    if (response.ok) router.refresh()
  }

  async function markPaid(businessId: string, name: string) {
    if (!confirm(`Marcar ${name} como pago por 30 dias?`)) return
    setBusy(true); setNotice('')
    const response = await fetch('/api/admin/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId }),
    })
    const body = await response.json().catch(() => ({})) as { payment?: { paid_until?: string } }
    setBusy(false)
    setNotice(response.ok ? `Pagamento marcado. Pago até ${dateOnly(body.payment?.paid_until || null)}.` : 'Não consegui registrar o pagamento.')
    if (response.ok) router.refresh()
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.refresh()
  }

  const tabs: Array<[Tab, string]> = [['convites', 'Convites'], ['contas', 'Contas'], ['custos', 'Custos e uso']]

  return <main className="min-h-screen bg-slate-100 pb-16 text-slate-950">
    <header className="bg-slate-950 px-4 py-5 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-emerald-400">RPG CAPITAL · ADMIN</p>
          <p className="mt-1 text-sm text-white/60">Atualizado {date(data.generatedAt)}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.refresh()} className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold">Atualizar</button>
          <button onClick={logout} className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold">Sair</button>
        </div>
      </div>
      <nav className="mx-auto mt-4 flex max-w-7xl gap-2 overflow-x-auto">
        {tabs.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${tab === id ? 'bg-white text-slate-950' : 'bg-white/10 text-white'}`}>{label}</button>)}
        <a href="/admin/analytics" className="shrink-0 rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950">Site / tráfego</a>
      </nav>
    </header>

    <div className="mx-auto max-w-7xl px-4">
      {notice && <div className="mt-4 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">{notice}</div>}

      {tab === 'convites' && <>
        <Section title="Novo convite">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm font-semibold">Nome da pessoa *
                <input value={inviteeName} onChange={(e) => setInviteeName(e.target.value)} placeholder="Teste" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-normal outline-none focus:border-slate-900" />
              </label>
              <label className="text-sm font-semibold">WhatsApp
                <input value={inviteePhone} onChange={(e) => setInviteePhone(e.target.value)} placeholder="(12) 99999-9999" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-normal outline-none focus:border-slate-900" />
              </label>
              <label className="text-sm font-semibold">Nome da loja
                <input value={storeNameHint} onChange={(e) => setStoreNameHint(e.target.value)} placeholder="Mercadinho do João" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-normal outline-none focus:border-slate-900" />
              </label>
            </div>
            <button onClick={createInvite} disabled={busy || !inviteeName.trim()} className="mt-4 min-h-12 rounded-xl bg-slate-950 px-6 font-bold text-white disabled:opacity-50">Gerar convite</button>
            {created && (() => {
              const message = inviteMessage(created.name, created.link)
              const wa = created.phone ? inviteWhatsAppUrl(created.phone, message) : ''
              return <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950">
                <p className="break-all font-semibold">{created.link}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => copy(created.link)} className="rounded-full bg-emerald-700 px-4 py-2 font-semibold text-white">Copiar link</button>
                  <button onClick={() => copy(message)} className="rounded-full border border-emerald-700 px-4 py-2 font-semibold text-emerald-800">Copiar mensagem</button>
                  {wa && <a href={wa} target="_blank" rel="noreferrer" className="rounded-full border border-emerald-700 px-4 py-2 font-semibold text-emerald-800">Abrir no WhatsApp</a>}
                </div>
              </div>
            })()}
          </div>
        </Section>

        <Section title={`Convites salvos (${data.coupons.length})`}>
          {!data.coupons.length ? <p className="text-sm text-slate-500">Nenhum convite ainda.</p> :
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Pessoa / loja</th><th className="p-3">Link</th><th className="p-3">Status</th><th className="p-3">Ações</th></tr></thead>
                <tbody>{data.coupons.map((invite) => {
                  const message = inviteMessage(invite.inviteeName, invite.link)
                  const wa = invite.inviteePhone ? inviteWhatsAppUrl(invite.inviteePhone, message) : ''
                  const revoked = Boolean(invite.revokedAt) || invite.status === 'cancelled'
                  return <tr key={invite.code} className="border-t border-slate-100 align-top">
                    <td className="p-3"><div className="font-semibold">{invite.inviteeName}</div><div className="text-xs text-slate-500">{invite.storeNameHint || invite.businessName || 'loja não informada'}{invite.inviteePhone ? ` · ${invite.inviteePhone}` : ''}</div><div className="mt-1 text-xs text-slate-400">Criado {date(invite.createdAt)}</div></td>
                    <td className="max-w-[290px] p-3"><span className="break-all text-xs">{invite.link}</span></td>
                    <td className="p-3">{revoked ? <span className="font-bold text-rose-700">Revogado</span> : <Timeline invite={invite} />}</td>
                    <td className="p-3"><div className="flex min-w-[150px] flex-wrap gap-2">
                      <button onClick={() => copy(invite.link)} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold">Copiar link</button>
                      <button onClick={() => copy(message)} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold">Copiar mensagem</button>
                      {wa && <a href={wa} target="_blank" rel="noreferrer" className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold">WhatsApp</a>}
                      {invite.status === 'available' && !invite.redeemedAt && !revoked && <button onClick={() => revokeInvite(invite.code)} className="rounded-full border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700">Revogar</button>}
                    </div></td>
                  </tr>
                })}</tbody>
              </table>
            </div>}
        </Section>
      </>}

      {tab === 'contas' && <>
        <Section title="Cobrança manual por Pix">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end">
              <label className="text-sm font-semibold">Chave Pix
                <input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="Sua chave Pix" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-normal" />
              </label>
              <label className="text-sm font-semibold">Valor mensal
                <input value={planPrice} onChange={(e) => setPlanPrice(e.target.value)} inputMode="decimal" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-normal" />
              </label>
              <button onClick={saveSettings} disabled={busy} className="min-h-12 rounded-xl bg-slate-950 px-5 font-bold text-white disabled:opacity-50">Salvar</button>
            </div>
          </div>
        </Section>
        <Section title={`Contas (${data.accounts.length})`}>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Loja</th><th className="p-3">Dono</th><th className="p-3">WhatsApp</th><th className="p-3">Criada</th><th className="p-3">Banco</th><th className="p-3">Rafa</th><th className="p-3">Pagamento</th><th className="p-3">Ações</th></tr></thead>
              <tbody>{data.accounts.map((account) => {
                const charge = billingMessage(account.ownerName || account.name, data.settings.planPriceCents, data.settings.pixKey)
                const paid = Boolean(account.paidUntil && account.paidUntil >= new Date().toISOString().slice(0, 10))
                return <tr key={account.businessId} className="border-t border-slate-100 align-top">
                  <td className="p-3 font-semibold">{account.name}</td>
                  <td className="p-3">{account.ownerName}</td>
                  <td className="p-3">{account.phone || '—'}</td>
                  <td className="p-3">{date(account.createdAt)}</td>
                  <td className="p-3">{account.bankConnected ? 'Sim' : 'Não'}</td>
                  <td className="p-3">{account.rafaWelcomed ? 'Sim' : 'Não'}</td>
                  <td className="p-3">{paid ? <span className="font-bold text-emerald-700">Pago até {dateOnly(account.paidUntil)}</span> : <span className="text-amber-700">Pendente</span>}</td>
                  <td className="p-3"><div className="flex min-w-[190px] flex-wrap gap-2">
                    <button onClick={() => copy(charge)} disabled={!data.settings.pixKey} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Copiar cobrança</button>
                    <button onClick={() => markPaid(account.businessId, account.name)} disabled={busy} className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Marcar pago</button>
                  </div></td>
                </tr>
              })}</tbody>
            </table>
          </div>
        </Section>
      </>}

      {tab === 'custos' && <>
        <Section title="IA da Rafa">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Card label="Hoje" value={brl(data.ai.today.brl)} hint={`${num(data.ai.today.calls)} chamadas · ${num(data.ai.today.input + data.ai.today.output)} tokens`} />
            <Card label="7 dias" value={brl(data.ai.d7.brl)} hint={`${num(data.ai.d7.calls)} chamadas · ${num(data.ai.d7.input + data.ai.d7.output)} tokens`} />
            <Card label="30 dias" value={brl(data.ai.d30.brl)} hint={`${num(data.ai.d30.calls)} chamadas · ${num(data.ai.d30.input + data.ai.d30.output)} tokens`} />
          </div>
          <p className="mt-2 text-xs text-slate-500">Convertido de dólar a R$ {data.fx.rate.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {data.fx.live ? '(cotação do dia)' : '(cotação aproximada)'}</p>
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
              {data.malvo.problems.map((problem, index) => <div key={index} className="mt-2 rounded-xl bg-amber-50 p-3"><b>{problem.name}</b> · {problem.bank} · {problem.status}<div className="text-xs text-slate-600">Última atualização: {date(problem.lastSync)}{problem.error ? ` · ${problem.error}` : ''}</div></div>)}
            </div>}
          </div>
        </Section>
      </>}
    </div>
  </main>
}
