'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, ShieldCheck } from 'lucide-react'

export default function OnboardingBillingStep({ businessId, userName }: { businessId: string; userName: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function startPayment() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/balcao/billing/onboarding/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string; checkoutUrl?: string; active?: boolean; bypass?: boolean }
      if (!response.ok) throw new Error(payload.error || 'Não foi possível iniciar o pagamento.')
      if (payload.active || payload.bypass) {
        router.refresh()
        return
      }
      if (!payload.checkoutUrl) throw new Error('O Asaas não retornou a página de pagamento.')
      window.location.assign(payload.checkoutUrl)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível iniciar o pagamento.')
      setBusy(false)
    }
  }

  return <div className="mx-auto w-full max-w-2xl">
    <header className="mb-7 px-1">
      <p className="text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
      <div className="mt-5 flex items-center justify-between gap-4 text-sm font-medium text-slate-600">
        <span>Etapa 5 de 6</span><span>83%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <div className="h-full w-5/6 rounded-full bg-blue-700" />
      </div>
    </header>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <p className="text-sm font-semibold text-blue-700">Ativação</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{userName ? `${userName.split(' ')[0]}, ` : ''}ative seu BALCÃO.</h1>
      <p className="mt-3 text-base leading-7 text-slate-600">O preço acompanha exatamente as contas bancárias conectadas. A primeira custa R$ 5,99 por mês; outras podem ser adicionadas depois por R$ 5,99 cada.</p>

      <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-slate-900">1 conta bancária</p>
            <p className="mt-1 text-sm text-slate-500">Assinatura mensal do BALCÃO</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-slate-950">R$ 5,99</p>
            <p className="text-xs font-medium text-slate-500">por mês</p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
        <p>O pagamento acontece na página segura do Asaas. O BALCÃO não recebe nem armazena número do cartão ou CVV.</p>
      </div>

      <p className="mt-5 text-sm leading-6 text-slate-600">Depois da confirmação, você volta automaticamente e conecta a primeira conta pelo Open Finance.</p>
      {error ? <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</p> : null}

      <button onClick={() => void startPayment()} disabled={busy} className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
        <CreditCard className="h-5 w-5" />{busy ? 'Abrindo pagamento…' : 'Ir para pagamento — R$ 5,99'}
      </button>
    </section>
  </div>
}
