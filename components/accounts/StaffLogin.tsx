'use client'

import { useCallback, useEffect, useState } from 'react'

type Person = {
  id: string
  displayName: string
  role: 'cashier' | 'stock' | 'manager' | 'custom'
}

type Context = {
  authorized: boolean
  store?: { displayName: string }
  terminal?: { displayName: string }
  staff?: Person[]
  currentStaff?: Person | null
  error?: string
}

const roleName = { cashier: 'Caixa', stock: 'Estoque', manager: 'Gerente', custom: 'Personalizado' } as const

export default function StaffLogin() {
  const [ctx, setCtx] = useState<Context | null>(null)
  const [selected, setSelected] = useState<Person | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const response = await fetch('/api/balcao/work/context', { cache: 'no-store' })
    setCtx(await response.json())
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (ctx?.currentStaff) window.location.replace('/inventory-v1')
  }, [ctx?.currentStaff])

  async function login() {
    if (!selected || pin.length !== 4 || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/balcao/staff/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ staffId: selected.id, pin }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(payload.error || 'PIN inválido.')
        setPin('')
        return
      }
      window.location.assign('/inventory-v1')
    } finally {
      setBusy(false)
    }
  }

  if (!ctx || ctx.currentStaff) return <p className="mx-auto max-w-md p-6 text-center">Abrindo BALCÃO…</p>

  if (!ctx.authorized) {
    return (
      <section className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Dispositivo não autorizado</h1>
        <p className="mt-3 leading-7 text-slate-600">Peça a um gerente um novo link de acesso para esta loja.</p>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-lg">
      <header>
        <p className="text-sm font-bold tracking-[.16em] text-blue-700">BALCÃO</p>
        <h1 className="mt-2 text-2xl font-bold">Quem está usando?</h1>
        <p className="mt-2 text-slate-600">{ctx.store?.displayName}</p>
      </header>

      {!selected ? (
        <div className="mt-6 grid gap-3">
          {(ctx.staff ?? []).map((person) => (
            <button key={person.id} onClick={() => setSelected(person)} className="min-h-16 rounded-xl border border-slate-300 bg-white px-5 text-left text-base font-semibold">
              <span className="block">{person.displayName}</span>
              <span className="mt-1 block text-sm font-normal text-slate-500">{roleName[person.role]}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <button onClick={() => { setSelected(null); setPin(''); setError('') }} className="min-h-11 text-sm font-semibold text-blue-700">← Voltar</button>
          <h2 className="mt-3 text-2xl font-bold">{selected.displayName}</h2>
          <p className="mt-2 text-slate-600">Digite seu PIN</p>
          <div aria-label="PIN digitado" className="my-6 flex justify-center gap-3">
            {[0, 1, 2, 3].map((index) => <span key={index} className="h-4 w-4 rounded-full border-2 border-slate-400 bg-slate-100">{pin[index] ? '' : ''}</span>)}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((number, index) => number ? (
              <button key={index} onClick={() => number === '⌫' ? setPin((value) => value.slice(0, -1)) : setPin((value) => value.length < 4 ? value + number : value)} className="min-h-14 rounded-xl bg-slate-100 text-xl font-bold">{number}</button>
            ) : <span key={index} />)}
          </div>
          {error ? <p role="alert" className="mt-4 text-center text-sm font-semibold text-red-700">{error}</p> : null}
          <button disabled={pin.length !== 4 || busy} onClick={login} className="mt-5 min-h-12 w-full rounded-xl bg-blue-700 px-5 font-semibold text-white disabled:opacity-40">{busy ? 'Entrando…' : 'Entrar'}</button>
          <p className="mt-5 text-center text-sm text-slate-500">Esqueceu o PIN? Peça a um gerente para criar um novo.</p>
        </div>
      )}
    </section>
  )
}
