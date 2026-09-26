'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !password) return
    setBusy(true)
    setError('')
    const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
    const body = await response.json().catch(() => ({})) as { error?: string }
    if (response.ok) {
      setPassword('')
      router.refresh()
      return
    }
    setBusy(false)
    setError(body.error === 'blocked' ? 'Muitas tentativas. Espere 15 minutos.' : body.error === 'not_configured' ? 'Senha do painel não configurada.' : 'Senha errada.')
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
    <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-7">
      <p className="text-xs font-bold tracking-[0.2em] text-emerald-400">RPG CAPITAL</p>
      <h1 className="mt-2 text-2xl font-bold">Painel de admin</h1>
      <label className="mt-6 block text-sm font-semibold text-white/80" htmlFor="admin-password">Senha</label>
      <input id="admin-password" type="password" inputMode="numeric" autoComplete="current-password" autoFocus value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-white/10 px-4 text-lg tracking-widest outline-none focus:border-emerald-400" />
      {error && <p className="mt-3 text-sm font-medium text-rose-300" role="alert">{error}</p>}
      <button disabled={busy || !password} className="mt-5 min-h-12 w-full rounded-xl bg-emerald-500 font-bold text-slate-950 disabled:opacity-50">{busy ? 'Entrando…' : 'Entrar'}</button>
    </form>
  </main>
}
