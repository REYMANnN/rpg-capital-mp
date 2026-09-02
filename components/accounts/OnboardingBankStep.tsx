'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BankConnections from '@/app/inventory-v1/finance/BankConnections'

export default function OnboardingBankStep({ storeId, userName }: { storeId: string; userName: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [activeConnectionCount, setActiveConnectionCount] = useState(0)

  async function finish() {
    if (busy) return
    if (activeConnectionCount < 1) {
      setError('Conecte pelo menos uma conta bancária para concluir o cadastro.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/balcao/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir o cadastro.')
      router.replace('/manage')
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir o cadastro.')
      setBusy(false)
    }
  }

  return <div className="mx-auto w-full max-w-3xl">
    <header className="mb-7 px-1">
      <p className="text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
      <div className="mt-5 flex items-center justify-between gap-4 text-sm font-medium text-slate-600">
        <span>Etapa 5 de 5</span><span>100%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-full rounded-full bg-blue-700" /></div>
    </header>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <p className="text-sm font-semibold text-blue-700">Conta bancária</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{userName ? `${userName.split(' ')[0]}, ` : ''}conecte a conta do seu negócio.</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">É obrigatório conectar pelo menos uma conta bancária. Depois da primeira, você pode adicionar quantas contas quiser. A autorização acontece diretamente no seu banco pelo Open Finance; o BALCÃO não recebe sua senha.</p>

      <div className="mt-7">
        <BankConnections
          storeId={storeId}
          returnTo="onboarding"
          onConnectionCountChange={setActiveConnectionCount}
        />
      </div>

      {activeConnectionCount < 1 ? <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Conecte pelo menos uma conta bancária para liberar a conclusão do cadastro.</p> : null}
      {error ? <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</p> : null}
      <div className="mt-6 flex justify-end">
        <button onClick={() => void finish()} disabled={busy || activeConnectionCount < 1} className="min-h-12 rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Concluindo…' : activeConnectionCount < 1 ? 'Conecte uma conta para continuar' : 'Entrar no BALCÃO'}</button>
      </div>
    </section>
  </div>
}
