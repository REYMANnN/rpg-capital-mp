'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

function digits(value: string) {
  return value.replace(/\D/g, '')
}

export default function OnboardingBillingStep({
  storeId,
  userName,
  userEmail,
}: {
  storeId: string
  userName: string
  userEmail: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [card, setCard] = useState({ holderName: userName, number: '', expiryMonth: '', expiryYear: '', ccv: '' })
  const [holder, setHolder] = useState({ name: userName, email: userEmail, cpfCnpj: '', postalCode: '', addressNumber: '', addressComplement: '', mobilePhone: '' })

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!accepted) {
      setError('Confirme a autorização da cobrança recorrente para continuar.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/balcao/billing/asaas/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          acceptedRecurringBilling: true,
          creditCard: {
            holderName: card.holderName.trim(),
            number: digits(card.number),
            expiryMonth: digits(card.expiryMonth),
            expiryYear: digits(card.expiryYear),
            ccv: digits(card.ccv),
          },
          creditCardHolderInfo: {
            name: holder.name.trim(),
            email: holder.email.trim(),
            cpfCnpj: digits(holder.cpfCnpj),
            postalCode: digits(holder.postalCode),
            addressNumber: holder.addressNumber.trim(),
            addressComplement: holder.addressComplement.trim(),
            mobilePhone: digits(holder.mobilePhone),
          },
        }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Não foi possível configurar a cobrança.')

      // Card data stays only in this browser request and is discarded after Asaas accepts it.
      setCard({ holderName: '', number: '', expiryMonth: '', expiryYear: '', ccv: '' })
      router.replace('/onboarding?step=bank')
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível configurar a cobrança.')
      setBusy(false)
    }
  }

  const inputClass = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-blue-700 focus:ring-4 focus:ring-blue-100'
  const labelClass = 'mb-2 block text-sm font-semibold text-slate-800'

  return <div className="mx-auto w-full max-w-3xl">
    <header className="mb-7 px-1">
      <p className="text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
      <div className="mt-5 flex items-center justify-between gap-4 text-sm font-medium text-slate-600">
        <span>Etapa 5 de 6</span><span>83%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-5/6 rounded-full bg-blue-700" /></div>
    </header>

    <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <p className="text-sm font-semibold text-blue-700">Plano e cobrança</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Balcão — R$ 5,99/mês</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Cobrança mensal todo dia 1. Não usamos proporcionalidade.</p>
      <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
        Se você entrar depois do dia 1, não cobramos agora. No próximo dia 1 serão R$ 11,98 — mês de entrada + mês atual. Depois, R$ 5,99 todo dia 1.
      </div>

      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="card-number">Número do cartão</label>
          <input id="card-number" required inputMode="numeric" autoComplete="cc-number" className={inputClass} value={card.number} onChange={(e) => setCard((current) => ({ ...current, number: e.target.value.slice(0, 23) }))} placeholder="0000 0000 0000 0000" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="card-holder">Nome impresso no cartão</label>
          <input id="card-holder" required autoComplete="cc-name" className={inputClass} value={card.holderName} onChange={(e) => setCard((current) => ({ ...current, holderName: e.target.value }))} />
        </div>
        <div>
          <label className={labelClass} htmlFor="card-month">Mês</label>
          <input id="card-month" required inputMode="numeric" autoComplete="cc-exp-month" className={inputClass} value={card.expiryMonth} onChange={(e) => setCard((current) => ({ ...current, expiryMonth: digits(e.target.value).slice(0, 2) }))} placeholder="MM" />
        </div>
        <div>
          <label className={labelClass} htmlFor="card-year">Ano</label>
          <input id="card-year" required inputMode="numeric" autoComplete="cc-exp-year" className={inputClass} value={card.expiryYear} onChange={(e) => setCard((current) => ({ ...current, expiryYear: digits(e.target.value).slice(0, 4) }))} placeholder="AAAA" />
        </div>
        <div>
          <label className={labelClass} htmlFor="card-ccv">CVV</label>
          <input id="card-ccv" required inputMode="numeric" autoComplete="cc-csc" className={inputClass} value={card.ccv} onChange={(e) => setCard((current) => ({ ...current, ccv: digits(e.target.value).slice(0, 4) }))} placeholder="123" />
        </div>
      </div>

      <h2 className="mt-9 text-lg font-bold text-slate-950">Titular do cartão</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="holder-name">Nome completo</label>
          <input id="holder-name" required autoComplete="name" className={inputClass} value={holder.name} onChange={(e) => setHolder((current) => ({ ...current, name: e.target.value }))} />
        </div>
        <div>
          <label className={labelClass} htmlFor="holder-email">E-mail</label>
          <input id="holder-email" required type="email" autoComplete="email" className={inputClass} value={holder.email} onChange={(e) => setHolder((current) => ({ ...current, email: e.target.value }))} />
        </div>
        <div>
          <label className={labelClass} htmlFor="holder-tax">CPF/CNPJ</label>
          <input id="holder-tax" required inputMode="numeric" className={inputClass} value={holder.cpfCnpj} onChange={(e) => setHolder((current) => ({ ...current, cpfCnpj: e.target.value.slice(0, 18) }))} />
        </div>
        <div>
          <label className={labelClass} htmlFor="holder-phone">Celular</label>
          <input id="holder-phone" inputMode="tel" autoComplete="tel" className={inputClass} value={holder.mobilePhone} onChange={(e) => setHolder((current) => ({ ...current, mobilePhone: e.target.value.slice(0, 16) }))} />
        </div>
        <div>
          <label className={labelClass} htmlFor="holder-cep">CEP</label>
          <input id="holder-cep" required inputMode="numeric" autoComplete="postal-code" className={inputClass} value={holder.postalCode} onChange={(e) => setHolder((current) => ({ ...current, postalCode: e.target.value.slice(0, 9) }))} />
        </div>
        <div>
          <label className={labelClass} htmlFor="holder-number">Número do endereço</label>
          <input id="holder-number" required className={inputClass} value={holder.addressNumber} onChange={(e) => setHolder((current) => ({ ...current, addressNumber: e.target.value.slice(0, 20) }))} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="holder-complement">Complemento <span className="font-normal text-slate-500">(opcional)</span></label>
          <input id="holder-complement" className={inputClass} value={holder.addressComplement} onChange={(e) => setHolder((current) => ({ ...current, addressComplement: e.target.value.slice(0, 80) }))} />
        </div>
      </div>

      <label className="mt-7 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 text-sm leading-6 text-slate-700">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 h-4 w-4" />
        <span>Ao continuar, você autoriza a cobrança recorrente do BALCÃO de R$ 5,99 todo dia 1, conforme as condições apresentadas acima.</span>
      </label>

      <p className="mt-4 text-xs leading-5 text-slate-500">Os dados completos do cartão são enviados diretamente ao Asaas pelo servidor do BALCÃO e não são armazenados no nosso banco de dados.</p>
      {error ? <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</p> : null}

      <div className="mt-7 flex justify-end">
        <button type="submit" disabled={busy || !accepted} className="min-h-12 rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Configurando…' : 'Continuar para conectar o banco'}</button>
      </div>
    </form>
  </div>
}
