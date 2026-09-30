'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BankConnections from '@/app/inventory-v1/finance/BankConnections'

export default function OnboardingBankStep({
  storeId,
  userName,
  title,
  successHref = '/manage',
  stepLabel = true,
}: {
  storeId: string
  userName: string
  title?: string
  successHref?: string
  stepLabel?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [activeConnectionCount, setActiveConnectionCount] = useState(0)
  const [confirmSkip, setConfirmSkip] = useState(false)

  async function finish(skipBank = false) {
    if (busy) return
    if (!skipBank && activeConnectionCount < 1) {
      setError('Conecte pelo menos uma conta bancária para concluir o cadastro.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/balcao/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, skipBank }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir o cadastro.')
      router.replace(successHref)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir o cadastro.')
      setBusy(false)
    }
  }

  return <div className="mx-auto w-full max-w-3xl">
    <header className="mb-7 px-1">
      <p className="text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
      {stepLabel ? <>
        <div className="mt-5 flex items-center justify-between gap-4 text-sm font-medium text-slate-600">
          <span>Etapa 6 de 6</span><span>100%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-full rounded-full bg-blue-700" /></div>
      </> : null}
    </header>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <p className="text-sm font-semibold text-blue-700">Conta bancária</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{title || (userName ? `${userName.split(' ')[0]}, conecte a conta do seu negócio.` : 'Conecte a conta do seu negócio.')}</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Conecte a conta da loja para a Rafa ver saldo e extrato. Se preferir, conecte depois. Depois da primeira, você pode adicionar quantas contas quiser. A autorização acontece diretamente no seu banco pelo Open Finance; o BALCÃO não recebe sua senha.</p>

      <div className="mt-7">
        <BankConnections
          storeId={storeId}
          returnTo="onboarding"
          onConnectionCountChange={setActiveConnectionCount}
        />
      </div>

      {error ? <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</p> : null}
      {activeConnectionCount < 1 && confirmSkip ? <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">Sem o banco, a Rafa não vê saldo nem extrato.</p>
        <p className="mt-1 text-sm text-slate-600">Você conecta quando quiser: é só pedir pra Rafa no WhatsApp ou entrar em rpgcapital.com.br/conectar-banco.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => void finish(true)} disabled={busy} className="min-h-11 rounded-xl bg-slate-900 px-5 font-semibold text-white disabled:opacity-50">{busy ? 'Concluindo…' : 'Entendi, conectar depois'}</button>
          <button onClick={() => setConfirmSkip(false)} disabled={busy} className="min-h-11 rounded-xl border border-slate-300 px-5 font-semibold text-slate-800">Voltar</button>
        </div>
      </div> : null}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        {activeConnectionCount < 1 && !confirmSkip ? <button onClick={() => setConfirmSkip(true)} disabled={busy} className="min-h-12 rounded-xl px-5 font-semibold text-slate-600 underline-offset-4 hover:underline">Conectar depois</button> : null}
        <button onClick={() => void finish()} disabled={busy || activeConnectionCount < 1} className="min-h-12 rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Concluindo…' : activeConnectionCount < 1 ? 'Conecte uma conta para continuar' : successHref === '/onboarding/pronto' ? 'Concluir cadastro' : 'Entrar no BALCÃO'}</button>
      </div>
    </section>
  </div>
}
