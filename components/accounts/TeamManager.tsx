'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { modulesForPermissions, permissionsForModules, type Permission, type StaffModule } from '@/lib/accounts/access'

type Person = { id: string; displayName: string; role: string; active: boolean; accessUrl?: string | null; customPermissions?: Permission[] }
type ApiPayload = { error?: string; staff?: Person[]; accessUrl?: string }

const labels: Record<string, string> = { cashier: 'Caixa', stock: 'Estoque', finance: 'Financeiro', it: 'TI', manager: 'Gerente', custom: 'Personalizado' }
const moduleLabels: Record<StaffModule, string> = { stock: 'Estoque', checkout: 'Caixa', finance: 'Financeiro', automations: 'Automações' }

async function readPayload(response: Response): Promise<ApiPayload> {
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) return {}
  return response.json().catch(() => ({}))
}
async function copyText(value: string) { if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value); window.prompt('Copie o link de acesso:', value) }
function describeRole(person: Person) {
  if (person.role !== 'custom') return labels[person.role] || person.role
  const modules = modulesForPermissions(person.customPermissions ?? [])
  return modules.length ? `${labels.custom} · ${modules.map((module) => moduleLabels[module]).join(' + ')}` : labels.custom
}

export default function TeamManager({ storeId }: { storeId: string }) {
  const [people, setPeople] = useState<Person[]>([])
  const [name, setName] = useState('')
  const [role, setRole] = useState('cashier')
  const [modules, setModules] = useState<StaffModule[]>([])
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [linkBusy, setLinkBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!storeId) return
    try {
      const response = await fetch(`/api/balcao/staff?storeId=${encodeURIComponent(storeId)}`, { cache: 'no-store' })
      const payload = await readPayload(response)
      if (!response.ok) return setError(payload.error || 'Não conseguimos carregar a equipe.')
      setPeople(payload.staff || [])
    } catch { setError('Não conseguimos carregar a equipe. Tente novamente.') }
  }, [storeId])
  useEffect(() => { void load() }, [load])
  function toggleModule(module: StaffModule) { setModules((current) => current.includes(module) ? current.filter((item) => item !== module) : [...current, module]) }

  async function add(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (name.trim().length < 2) return setError('Informe o nome do funcionário.')
    if (!/^\d{4}$/.test(pin)) return setError('O PIN deve ter exatamente 4 números.')
    if (role === 'custom' && modules.length === 0) return setError('Escolha ao menos um módulo para o acesso personalizado.')
    setBusy(true); setError(''); setNotice('')
    try {
      const customPermissions = role === 'custom' ? [...permissionsForModules(modules)] : []
      const response = await fetch('/api/balcao/staff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeId, displayName: name.trim(), role, pin, customPermissions }) })
      const payload = await readPayload(response)
      if (!response.ok) throw new Error(payload.error || 'Não conseguimos adicionar o funcionário.')
      setName(''); setPin(''); setRole('cashier'); setModules([]); setNotice('Funcionário adicionado. O link de acesso já está disponível ao lado do nome.'); await load()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não conseguimos adicionar o funcionário.') }
    finally { setBusy(false) }
  }

  async function copyLink(person: Person) { if (!person.accessUrl) return; try { await copyText(person.accessUrl); setNotice(`Link de ${person.displayName} copiado.`) } catch { setError('Não conseguimos copiar o link.') } }
  async function rotateLink(person: Person) {
    if (!confirm(`Gerar um novo link para ${person.displayName}? O link atual deixará de funcionar.`)) return
    setLinkBusy(person.id); setError(''); setNotice('')
    try {
      const response = await fetch(`/api/balcao/staff/${person.id}/access-link`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeId }) })
      const payload = await readPayload(response)
      if (!response.ok || !payload.accessUrl) throw new Error(payload.error || 'Não conseguimos gerar o novo link.')
      setPeople((current) => current.map((item) => item.id === person.id ? { ...item, accessUrl: payload.accessUrl } : item)); await copyText(payload.accessUrl); setNotice(`Novo link de ${person.displayName} gerado e copiado. O anterior foi cancelado.`)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não conseguimos gerar o novo link.') } finally { setLinkBusy(null) }
  }
  async function reset(person: Person) {
    const next = prompt(`Novo PIN de 4 números para ${person.displayName}:`); if (!next) return
    const normalized = next.replace(/\D/g, '').slice(0, 4); if (!/^\d{4}$/.test(normalized)) return alert('O PIN deve ter exatamente 4 números.')
    const response = await fetch(`/api/balcao/staff/${person.id}/pin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeId, pin: normalized }) }).catch(() => null)
    if (!response?.ok) return alert('Não conseguimos redefinir o PIN.'); setNotice(`PIN de ${person.displayName} redefinido.`)
  }
  async function deactivate(person: Person) {
    if (!confirm(`Desativar o acesso de ${person.displayName}?`)) return
    const response = await fetch(`/api/balcao/staff/${person.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeId, active: false }) }).catch(() => null)
    if (!response?.ok) return setError('Não conseguimos desativar o funcionário. Tente novamente.'); await load()
  }

  return <div>
    {notice ? <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{notice}</p> : null}
    {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</p> : null}
    <div className="grid gap-3">{people.map((person) => <div key={person.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><p className="font-semibold">{person.displayName}</p><p className="text-sm text-slate-500">{describeRole(person)}{!person.active ? ' · Desativado' : ''}</p></div>{person.active && person.accessUrl ? <div className="mt-3 flex flex-wrap items-center gap-2"><a href={person.accessUrl} target="_blank" rel="noreferrer" className="max-w-full truncate rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-blue-700">Abrir link de acesso</a><button type="button" onClick={() => copyLink(person)} className="min-h-10 rounded-lg border px-3 text-sm font-semibold">Copiar link de acesso</button><button type="button" disabled={linkBusy === person.id} onClick={() => rotateLink(person)} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-slate-600">{linkBusy === person.id ? 'Gerando…' : 'Novo link'}</button></div> : null}</div>{person.active ? <div className="flex gap-2"><button type="button" onClick={() => reset(person)} className="min-h-11 rounded-lg border px-3 text-sm font-semibold">Redefinir PIN</button><button type="button" onClick={() => deactivate(person)} className="min-h-11 rounded-lg border px-3 text-sm font-semibold">Desativar</button></div> : null}</div></div>)}</div>

    <form onSubmit={add} className="mt-6 rounded-xl bg-slate-50 p-4">
      <h3 className="font-bold">Adicionar funcionário</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-sm font-semibold">Nome<input autoComplete="off" className="mt-2 min-h-12 w-full rounded-lg border bg-white px-3 text-base" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="text-sm font-semibold">Função<select className="mt-2 min-h-12 w-full rounded-lg border bg-white px-3 text-base" value={role} onChange={(event) => { setRole(event.target.value); setModules([]) }}><option value="cashier">Caixa</option><option value="stock">Estoque</option><option value="finance">Financeiro</option><option value="it">TI</option><option value="manager">Gerente</option><option value="custom">Personalizado</option></select></label><label className="text-sm font-semibold">PIN de 4 números<input inputMode="numeric" autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" className="mt-2 min-h-12 w-full rounded-lg border bg-white px-3 text-base tabular-nums" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} /></label></div>
      {role === 'it' ? <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950"><b>TI:</b> acesso somente a Automações, integrações, chaves de API e webhooks. Não recebe Estoque, Caixa ou Financeiro automaticamente.</p> : null}
      {role === 'manager' ? <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-950"><b>Gerente:</b> acesso completo aos módulos e dados operacionais desta loja, incluindo Automações.</p> : null}
      {role === 'custom' ? <fieldset className="mt-4 rounded-xl border border-slate-200 bg-white p-4"><legend className="px-1 text-sm font-bold">Acessos deste funcionário</legend><p className="mb-3 text-sm text-slate-500">Escolha somente os módulos necessários.</p><div className="grid gap-2 sm:grid-cols-4">{(['stock','checkout','finance','automations'] as StaffModule[]).map((module) => <label key={module} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm font-semibold"><input type="checkbox" checked={modules.includes(module)} onChange={() => toggleModule(module)} className="h-4 w-4"/><span>{moduleLabels[module]}</span></label>)}</div></fieldset> : null}
      <button disabled={busy || name.trim().length < 2 || pin.length !== 4 || (role === 'custom' && modules.length === 0)} className="mt-4 min-h-12 rounded-xl bg-blue-700 px-5 font-semibold text-white disabled:opacity-50">{busy ? 'Adicionando…' : 'Adicionar funcionário'}</button>
    </form>
  </div>
}
