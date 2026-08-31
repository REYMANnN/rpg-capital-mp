'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'

type Person = { id: string; displayName: string; role: string; active: boolean }

type ApiPayload = { error?: string; staff?: Person[] }

const labels: Record<string, string> = {
  cashier: 'Caixa',
  stock: 'Estoque',
  manager: 'Gerente',
  custom: 'Personalizado',
}

async function readPayload(response: Response): Promise<ApiPayload> {
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) return {}
  return response.json().catch(() => ({}))
}

export default function TeamManager({ storeId }: { storeId: string }) {
  const [people, setPeople] = useState<Person[]>([])
  const [name, setName] = useState('')
  const [role, setRole] = useState('cashier')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!storeId) return
    try {
      const response = await fetch(`/api/balcao/staff?storeId=${encodeURIComponent(storeId)}`, { cache: 'no-store' })
      const payload = await readPayload(response)
      if (!response.ok) {
        setError(payload.error || 'Não conseguimos carregar a equipe.')
        return
      }
      setPeople(payload.staff || [])
    } catch (caught) {
      console.error('BALCAO team load failed', caught)
      setError('Não conseguimos carregar a equipe. Tente novamente.')
    }
  }, [storeId])

  useEffect(() => {
    void load()
  }, [load])

  async function add(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (name.trim().length < 2) {
      setError('Informe o nome do funcionário.')
      return
    }
    if (!/^\d{4}$/.test(pin)) {
      setError('O PIN deve ter exatamente 4 números.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/balcao/staff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storeId, displayName: name.trim(), role, pin }),
      })
      const payload = await readPayload(response)
      if (!response.ok) throw new Error(payload.error || 'Não conseguimos adicionar o funcionário.')

      setName('')
      setPin('')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não conseguimos adicionar o funcionário.')
    } finally {
      setBusy(false)
    }
  }

  async function reset(person: Person) {
    const next = prompt(`Novo PIN de 4 números para ${person.displayName}:`)
    if (!next) return
    const normalized = next.replace(/\D/g, '').slice(0, 4)
    if (!/^\d{4}$/.test(normalized)) {
      alert('O PIN deve ter exatamente 4 números.')
      return
    }

    try {
      const response = await fetch(`/api/balcao/staff/${person.id}/pin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storeId, pin: normalized }),
      })
      const payload = await readPayload(response)
      if (!response.ok) alert(payload.error || 'Não conseguimos redefinir o PIN.')
    } catch {
      alert('Não conseguimos redefinir o PIN. Tente novamente.')
    }
  }

  async function deactivate(person: Person) {
    if (!confirm(`Desativar o acesso de ${person.displayName}?`)) return
    try {
      const response = await fetch(`/api/balcao/staff/${person.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storeId, active: false }),
      })
      const payload = await readPayload(response)
      if (!response.ok) {
        setError(payload.error || 'Não conseguimos desativar o funcionário.')
        return
      }
      await load()
    } catch {
      setError('Não conseguimos desativar o funcionário. Tente novamente.')
    }
  }

  return (
    <div>
      <div className="grid gap-3">
        {people.map((person) => (
          <div key={person.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
            <div>
              <p className="font-semibold">{person.displayName}</p>
              <p className="text-sm text-slate-500">{labels[person.role] || person.role}{!person.active ? ' · Desativado' : ''}</p>
            </div>
            {person.active ? (
              <div className="flex gap-2">
                <button type="button" onClick={() => reset(person)} className="min-h-11 rounded-lg border px-3 text-sm font-semibold">Redefinir PIN</button>
                <button type="button" onClick={() => deactivate(person)} className="min-h-11 rounded-lg border px-3 text-sm font-semibold">Desativar</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <form onSubmit={add} className="mt-6 rounded-xl bg-slate-50 p-4">
        <h3 className="font-bold">Adicionar funcionário</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-semibold">
            Nome
            <input
              autoComplete="off"
              className="mt-2 min-h-12 w-full rounded-lg border bg-white px-3 text-base"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="text-sm font-semibold">
            Função
            <select className="mt-2 min-h-12 w-full rounded-lg border bg-white px-3 text-base" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="cashier">Caixa</option>
              <option value="stock">Estoque</option>
              <option value="manager">Gerente</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            PIN de 4 números
            <input
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={4}
              pattern="[0-9]{4}"
              className="mt-2 min-h-12 w-full rounded-lg border bg-white px-3 text-base tabular-nums"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </label>
        </div>
        {error ? <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
        <button
          disabled={busy || name.trim().length < 2 || pin.length !== 4}
          className="mt-4 min-h-12 rounded-xl bg-blue-700 px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Adicionando…' : 'Adicionar funcionário'}
        </button>
      </form>
    </div>
  )
}
