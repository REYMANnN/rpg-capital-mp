'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function StaffAccessLogin({ token }: { token: string }) {
  const router = useRouter()
  const nameRef = useRef<HTMLInputElement>(null)
  const [storeName, setStoreName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const response = await fetch(`/api/balcao/staff/access/${encodeURIComponent(token)}/info`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({}))
        if (!active) return
        if (!response.ok) {
          setError(payload.error || 'Este link não está mais disponível.')
          return
        }
        setStoreName(payload.storeName || '')
        requestAnimationFrame(() => nameRef.current?.focus())
      } catch {
        if (active) setError('Não conseguimos verificar este link. Tente novamente.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [token])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || displayName.trim().length < 2 || pin.length !== 4) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/balcao/staff/access/${encodeURIComponent(token)}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName, pin }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(payload.error || 'Não conseguimos entrar.')
        setPin('')
        return
      }
      router.replace('/work')
      router.refresh()
    } catch {
      setError('A conexão falhou. Tente novamente.')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Acesso da equipe</h1>
      <p className="mt-2 leading-7 text-slate-600">
        {loading ? 'Verificando seu link…' : storeName ? `Entre para trabalhar em ${storeName}.` : 'Entre com seu nome e PIN.'}
      </p>

      {!loading && (
        <form onSubmit={submit} className="mt-7 grid gap-5">
          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            Nome
            <input
              ref={nameRef}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              enterKeyHint="next"
              maxLength={80}
              placeholder="Seu nome"
              className="min-h-14 rounded-xl border border-slate-300 bg-white px-4 text-base font-medium outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            PIN de 4 números
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              enterKeyHint="done"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength={4}
              placeholder="••••"
              className="min-h-14 rounded-xl border border-slate-300 bg-white px-4 text-center text-2xl font-bold tracking-[0.45em] outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
          </label>

          {error ? (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-800">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={busy || displayName.trim().length < 2 || pin.length !== 4 || Boolean(error && !storeName)}
            className="min-h-14 rounded-xl bg-blue-700 px-5 text-base font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm leading-6 text-slate-500">Esqueceu o PIN? Peça ao gerente para redefini-lo.</p>
    </section>
  )
}
