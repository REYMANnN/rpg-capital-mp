'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import type { TrialAccount } from '@/lib/admin/trial-accounts'

const when = (value: string | null) => value
  ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : 'Ainda não'

const phoneView = (value: string) => value.length === 13
  ? `+${value.slice(0, 2)} (${value.slice(2, 4)}) ${value.slice(4, 9)}-${value.slice(9)}`
  : value

function Pill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{children}</span>
}

export default function TrialAccountsClient({ initial }: { initial: TrialAccount[] }) {
  const router = useRouter()
  const [contactName, setContactName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<TrialAccount | null>(null)

  async function create() {
    if (busy) return
    setBusy(true); setNotice('')
    const response = await fetch('/api/admin/trial-accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactName, businessName, phone }),
    })
    const body = await response.json().catch(() => ({})) as { error?: string }
    setBusy(false)
    if (!response.ok) {
      setNotice(body.error === 'phone_already_linked' ? 'Esse WhatsApp já está ligado a uma conta ativa.' : body.error === 'invalid_phone' ? 'WhatsApp inválido.' : 'Não consegui criar a conta teste.')
      return
    }
    setContactName(''); setBusinessName(''); setPhone('')
    setNotice('Conta teste criada. A Rafa já reconhece esse WhatsApp.')
    router.refresh()
  }

  async function saveEdit() {
    if (!editing || busy) return
    setBusy(true); setNotice('')
    const response = await fetch('/api/admin/trial-accounts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId: editing.businessId, contactName: editing.contactName, businessName: editing.businessName, phone: editing.phone }),
    })
    const body = await response.json().catch(() => ({})) as { error?: string }
    setBusy(false)
    if (!response.ok) {
      setNotice(body.error === 'phone_already_linked' ? 'Esse WhatsApp já está ligado a outra conta ativa.' : 'Não consegui salvar a edição.')
      return
    }
    setEditing(null); setNotice('Conta teste atualizada.'); router.refresh()
  }

  async function deactivate(account: TrialAccount) {
    if (!account.active || !confirm(`Desativar ${account.businessName}? O histórico será preservado.`)) return
    setBusy(true); setNotice('')
    const response = await fetch('/api/admin/trial-accounts', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId: account.businessId }),
    })
    setBusy(false)
    setNotice(response.ok ? 'Conta teste desativada; histórico preservado.' : 'Não consegui desativar a conta.')
    if (response.ok) router.refresh()
  }

  return <main className="min-h-screen bg-slate-100 pb-16 text-slate-950">
    <header className="bg-slate-950 px-4 py-5 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div><p className="text-xs font-bold tracking-[0.2em] text-emerald-400">RPG CAPITAL · ADMIN</p><h1 className="mt-1 text-xl font-bold">Contas teste</h1></div>
        <a href="/admin" className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold">Voltar ao admin</a>
      </div>
    </header>

    <div className="mx-auto max-w-7xl px-4">
      {notice && <div className="mt-4 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">{notice}</div>}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold">Criar conta teste</h2>
        <p className="mt-1 text-sm text-slate-500">Sem login, senha, Pix, banco ou estoque inicial. O WhatsApp já fica ligado à Rafa.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm font-semibold">Nome da pessoa<input value={contactName} onChange={(event) => setContactName(event.target.value)} maxLength={120} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-normal" /></label>
          <label className="text-sm font-semibold">Nome do comércio<input value={businessName} onChange={(event) => setBusinessName(event.target.value)} maxLength={160} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-normal" /></label>
          <label className="text-sm font-semibold">WhatsApp<input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="(11) 99999-9999" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-normal" /></label>
        </div>
        <button onClick={create} disabled={busy || !contactName.trim() || !businessName.trim() || !phone.trim()} className="mt-4 min-h-12 rounded-xl bg-slate-950 px-6 font-bold text-white disabled:opacity-40">{busy ? 'Salvando…' : 'Criar conta teste'}</button>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold">Contas teste ({initial.length})</h2>
        {!initial.length ? <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Nenhuma conta teste criada.</div> : <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Pessoa / comércio</th><th className="p-3">WhatsApp</th><th className="p-3">Rafa</th><th className="p-3">Pix</th><th className="p-3">Estoque</th><th className="p-3">Conversa</th><th className="p-3">Conta</th><th className="p-3">Ações</th></tr></thead>
            <tbody>{initial.map((account) => <tr key={account.businessId} className="border-t border-slate-100 align-top">
              <td className="p-3"><div className="font-bold">{account.businessName}</div><div className="text-slate-500">{account.contactName || 'Sem nome'}</div><div className="mt-1 text-xs text-slate-400">Criada {when(account.createdAt)}</div></td>
              <td className="p-3 font-mono text-xs">{phoneView(account.phone)}</td>
              <td className="p-3"><Pill ok={account.rafaLinked}>{account.rafaLinked ? 'Reconhece' : 'Sem vínculo'}</Pill></td>
              <td className="p-3"><Pill ok={Boolean(account.pixKey)}>{account.pixKey ? 'Cadastrado' : 'Pendente'}</Pill></td>
              <td className="p-3"><Pill ok={account.productCount > 0}>{account.productCount > 0 ? `${account.productCount} produto${account.productCount === 1 ? '' : 's'}` : 'Vazio'}</Pill></td>
              <td className="p-3"><Pill ok={Boolean(account.lastInteractionAt)}>{account.lastInteractionAt ? `Conversou ${when(account.lastInteractionAt)}` : 'Ainda não conversou'}</Pill></td>
              <td className="p-3"><Pill ok={account.active}>{account.active ? 'Ativa' : 'Desativada'}</Pill></td>
              <td className="p-3"><div className="flex gap-2"><button disabled={!account.active || busy} onClick={() => setEditing({ ...account })} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Editar</button><button disabled={!account.active || busy} onClick={() => deactivate(account)} className="rounded-full border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-40">Desativar</button></div></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
    </div>

    {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null) }}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold">Editar conta teste</h2>
        <label className="mt-4 block text-sm font-semibold">Nome da pessoa<input value={editing.contactName} onChange={(event) => setEditing({ ...editing, contactName: event.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-normal" /></label>
        <label className="mt-3 block text-sm font-semibold">Nome do comércio<input value={editing.businessName} onChange={(event) => setEditing({ ...editing, businessName: event.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-normal" /></label>
        <label className="mt-3 block text-sm font-semibold">WhatsApp<input value={editing.phone} onChange={(event) => setEditing({ ...editing, phone: event.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-normal" /></label>
        <div className="mt-5 flex justify-end gap-2"><button onClick={() => setEditing(null)} className="min-h-11 rounded-xl border border-slate-300 px-4 font-semibold">Cancelar</button><button onClick={saveEdit} disabled={busy} className="min-h-11 rounded-xl bg-slate-950 px-4 font-bold text-white disabled:opacity-40">Salvar</button></div>
      </div>
    </div>}
  </main>
}
