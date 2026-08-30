'use client'

import { FormEvent, useState } from 'react'

type Store = { id: string; displayName: string }

const TYPES = [
  ['mercadinho', 'Mercadinho / Mercearia'],
  ['supermercado', 'Supermercado'],
  ['conveniencia', 'Loja de conveniência'],
  ['distribuidora', 'Distribuidora'],
  ['farmacia', 'Farmácia'],
  ['emporio', 'Empório'],
  ['padaria', 'Padaria'],
  ['acougue', 'Açougue'],
  ['hortifruti', 'Hortifruti'],
  ['bebidas', 'Loja de bebidas'],
  ['petshop', 'Pet shop'],
  ['cosmeticos', 'Cosméticos / Perfumaria'],
  ['construcao', 'Material de construção'],
  ['papelaria', 'Papelaria'],
  ['outro', 'Outro'],
] as const

export default function StoreManager({ businessId, stores }: { businessId: string; stores: Store[] }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ displayName: '', businessType: 'mercadinho', cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' })

  function set(name: keyof typeof form, value: string) { setForm((current) => ({ ...current, [name]: value })) }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const response = await fetch('/api/balcao/stores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ businessId, ...form }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(payload.error || 'Não conseguimos criar a loja.')
      setBusy(false)
      return
    }
    window.location.reload()
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-bold">Lojas</h2><p className="mt-1 text-sm text-slate-500">{stores.length} {stores.length === 1 ? 'loja cadastrada' : 'lojas cadastradas'}</p></div>
      <button onClick={() => setOpen((value) => !value)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold">{open ? 'Cancelar' : 'Adicionar loja'}</button>
    </div>
    <div className="mt-4 grid gap-2">{stores.map((store) => <a key={store.id} href={`/api/balcao/stores/open?storeId=${encodeURIComponent(store.id)}`} className="flex min-h-12 items-center rounded-lg bg-slate-50 px-4 font-semibold">{store.displayName}</a>)}</div>
    {open ? <form onSubmit={submit} className="mt-5 grid gap-4 border-t border-slate-200 pt-5">
      <label className="text-sm font-semibold">Nome da loja<input required value={form.displayName} onChange={(e) => set('displayName', e.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base" /></label>
      <label className="text-sm font-semibold">Tipo de comércio<select value={form.businessType} onChange={(e) => set('businessType', e.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base">{TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm font-semibold">CEP<input inputMode="numeric" required value={form.cep} onChange={(e) => set('cep', e.target.value.replace(/\D/g, '').slice(0, 8))} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base" /></label><label className="text-sm font-semibold sm:col-span-2">Endereço<input required value={form.street} onChange={(e) => set('street', e.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base" /></label></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Número<input required value={form.number} onChange={(e) => set('number', e.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base" /></label><label className="text-sm font-semibold">Complemento<input value={form.complement} onChange={(e) => set('complement', e.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base" /></label></div>
      <label className="text-sm font-semibold">Bairro<input value={form.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base" /></label>
      <div className="grid gap-3 sm:grid-cols-[1fr_120px]"><label className="text-sm font-semibold">Cidade<input required value={form.city} onChange={(e) => set('city', e.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base" /></label><label className="text-sm font-semibold">UF<input required maxLength={2} value={form.state} onChange={(e) => set('state', e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base" /></label></div>
      {error ? <p role="alert" className="text-sm font-semibold text-red-700">{error}</p> : null}
      <button disabled={busy} className="min-h-12 rounded-xl bg-blue-700 px-5 font-semibold text-white disabled:opacity-50">{busy ? 'Criando…' : 'Criar loja'}</button>
    </form> : null}
  </section>
}
