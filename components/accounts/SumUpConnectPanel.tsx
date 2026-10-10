'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Reader = { id: string; name: string }

// Conectar a maquininha (SumUp) — usado no cadastro e em /conectar-maquininha.
export default function SumUpConnectPanel({
  storeId,
  connected,
  readers: initialReaders,
  signupUrl,
  status,
  nextHref,
  onboarding = false,
  whatsappHref,
}: {
  storeId: string
  connected: boolean
  readers: Reader[]
  signupUrl: string
  status: 'pending' | 'signing_up' | 'connected' | 'skipped' | null
  nextHref?: string
  onboarding?: boolean
  whatsappHref?: string
}) {
  const router = useRouter()
  const [readers, setReaders] = useState(initialReaders)
  const [signingUp, setSigningUp] = useState(status === 'signing_up')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const connectHref = `/api/sumup/connect?loja=${encodeURIComponent(storeId)}&next=${encodeURIComponent(onboarding ? `/onboarding/maquininha?next=${encodeURIComponent(nextHref || '/manage')}` : `/conectar-maquininha?loja=${storeId}`)}`

  async function save(next: 'signing_up' | 'skipped') {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/sumup/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, status: next }),
      })
      if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error || 'Não consegui salvar.')
      if (next === 'skipped' && nextHref) { router.replace(nextHref); router.refresh(); return }
      setSigningUp(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não consegui salvar.')
    } finally {
      setBusy(false)
    }
  }

  async function pair() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/sumup/readers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, code, name }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error || 'Não consegui parear.')
      setReaders(result.readers || [])
      setCode('')
      setName('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não consegui parear.')
    } finally {
      setBusy(false)
    }
  }

  const button = 'flex min-h-12 w-full items-center justify-center rounded-xl px-5 text-center font-semibold'

  if (!connected) {
    return <div className="mt-6 grid gap-3">
      <a href={connectHref} className={`${button} bg-blue-700 text-white hover:bg-blue-800`}>{signingUp ? 'Já criei minha conta, conectar agora' : 'Já tenho SumUp, conectar'}</a>
      {!signingUp ? <a href={signupUrl} target="_blank" rel="noreferrer" onClick={() => void save('signing_up')} className={`${button} border border-slate-300 text-slate-900 hover:bg-slate-50`}>Quero criar minha conta SumUp</a>
        : <p className="rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-950">Termine o cadastro na SumUp (eles conferem documento e CNPJ, pode levar até um dia). Quando a conta estiver aprovada, volte aqui com o mesmo Google e toque em conectar. <a href={signupUrl} target="_blank" rel="noreferrer" className="font-semibold underline">Abrir cadastro da SumUp</a></p>}
      {onboarding ? <button onClick={() => void save('skipped')} disabled={busy} className={`${button} text-slate-600 hover:underline`}>Conectar depois</button> : null}
      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
    </div>
  }

  return <div className="mt-6 grid gap-4">
    <p className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">Conta SumUp conectada ✓</p>
    <div>
      <p className="font-semibold">Maquininhas</p>
      {readers.length ? <ul className="mt-2 grid gap-2">{readers.map((reader) => <li key={reader.id} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">{reader.name}</li>)}</ul>
        : <p className="mt-1 text-sm text-slate-600">Nenhuma ainda.</p>}
    </div>
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="font-semibold">Parear uma Solo</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">Na maquininha (deslogada): menu de cima → Conexões → API → Conectar. Digite o código que aparecer.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Código (ex.: A1B2C3D4)" className="min-h-11 rounded-xl border border-slate-300 px-3" />
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome (ex.: Caixa 1)" className="min-h-11 rounded-xl border border-slate-300 px-3" />
        <button onClick={() => void pair()} disabled={busy || code.trim().length < 8} className="min-h-11 rounded-xl bg-blue-700 px-5 font-semibold text-white disabled:opacity-50">{busy ? 'Pareando…' : 'Parear'}</button>
      </div>
      {error ? <p className="mt-2 text-sm font-semibold text-red-700">{error}</p> : null}
    </div>
    {nextHref ? <a href={nextHref} className={`${button} bg-slate-900 text-white`}>Continuar</a> : null}
    {whatsappHref ? <a href={whatsappHref} target="_blank" rel="noreferrer" className={`${button} bg-emerald-600 text-white`}>Voltar pra Rafa</a> : null}
  </div>
}
