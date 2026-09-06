'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  digits,
  formatCardNumber,
  formatCpfCnpj,
  formatPhone,
  formatPostalCode,
  normalizeExpiryYear,
  validateAndNormalizeBillingInput,
  type BillingFieldErrors,
} from '@/lib/billing/cardValidation'

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
  const [fieldErrors, setFieldErrors] = useState<BillingFieldErrors>({})
  const [accepted, setAccepted] = useState(false)
  const [card, setCard] = useState({ holderName: userName, number: '', expiryMonth: '', expiryYear: '', ccv: '' })
  const [holder, setHolder] = useState({ name: userName, email: userEmail, cpfCnpj: '', postalCode: '', addressNumber: '', addressComplement: '', mobilePhone: '' })

  function clearFieldError(field: keyof BillingFieldErrors) {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
    setError('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!accepted) {
      setError('Confirme a autorização da cobrança recorrente para continuar.')
      return
    }

    const validation = validateAndNormalizeBillingInput(card, holder)
    if (!validation.creditCard || !validation.creditCardHolderInfo) {
      setFieldErrors(validation.errors)
      setError('Corrija os campos destacados para continuar.')
      return
    }

    setBusy(true)
    setError('')
    setFieldErrors({})
    try {
      const response = await fetch('/api/balcao/billing/asaas/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          acceptedRecurringBilling: true,
          creditCard: validation.creditCard,
          creditCardHolderInfo: validation.creditCardHolderInfo,
        }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string; fieldErrors?: BillingFieldErrors }
      if (!response.ok) {
        if (payload.fieldErrors) setFieldErrors(payload.fieldErrors)
        throw new Error(payload.error || 'Não foi possível configurar a cobrança.')
      }

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
  const errorInputClass = 'border-rose-400 focus:border-rose-600 focus:ring-rose-100'
  const fieldErrorClass = 'mt-2 text-sm font-medium text-rose-700'
  const fieldClass = (field: keyof BillingFieldErrors) => `${inputClass} ${fieldErrors[field] ? errorInputClass : ''}`

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
          <input id="card-number" required inputMode="numeric" autoComplete="cc-number" className={fieldClass('cardNumber')} value={card.number} aria-invalid={Boolean(fieldErrors.cardNumber)} onChange={(e) => { clearFieldError('cardNumber'); setCard((current) => ({ ...current, number: formatCardNumber(e.target.value) })) }} placeholder="0000 0000 0000 0000" maxLength={23} />
          {fieldErrors.cardNumber ? <p className={fieldErrorClass}>{fieldErrors.cardNumber}</p> : null}
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="card-holder">Nome impresso no cartão</label>
          <input id="card-holder" required autoComplete="cc-name" className={fieldClass('cardHolderName')} value={card.holderName} aria-invalid={Boolean(fieldErrors.cardHolderName)} onChange={(e) => { clearFieldError('cardHolderName'); setCard((current) => ({ ...current, holderName: e.target.value })) }} />
          {fieldErrors.cardHolderName ? <p className={fieldErrorClass}>{fieldErrors.cardHolderName}</p> : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="card-month">Mês</label>
          <input id="card-month" required inputMode="numeric" autoComplete="cc-exp-month" className={fieldClass('expiryMonth')} value={card.expiryMonth} aria-invalid={Boolean(fieldErrors.expiryMonth)} onChange={(e) => { clearFieldError('expiryMonth'); setCard((current) => ({ ...current, expiryMonth: digits(e.target.value).slice(0, 2) })) }} onBlur={() => setCard((current) => ({ ...current, expiryMonth: current.expiryMonth ? current.expiryMonth.padStart(2, '0').slice(-2) : '' }))} placeholder="MM" maxLength={2} />
          {fieldErrors.expiryMonth ? <p className={fieldErrorClass}>{fieldErrors.expiryMonth}</p> : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="card-year">Ano</label>
          <input id="card-year" required inputMode="numeric" autoComplete="cc-exp-year" className={fieldClass('expiryYear')} value={card.expiryYear} aria-invalid={Boolean(fieldErrors.expiryYear)} onChange={(e) => { clearFieldError('expiryYear'); setCard((current) => ({ ...current, expiryYear: digits(e.target.value).slice(0, 4) })) }} onBlur={() => setCard((current) => ({ ...current, expiryYear: normalizeExpiryYear(current.expiryYear) }))} placeholder="2030 ou 30" maxLength={4} />
          {fieldErrors.expiryYear ? <p className={fieldErrorClass}>{fieldErrors.expiryYear}</p> : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="card-ccv">CVV</label>
          <input id="card-ccv" required inputMode="numeric" autoComplete="cc-csc" className={fieldClass('ccv')} value={card.ccv} aria-invalid={Boolean(fieldErrors.ccv)} onChange={(e) => { clearFieldError('ccv'); setCard((current) => ({ ...current, ccv: digits(e.target.value).slice(0, 4) })) }} placeholder="123" maxLength={4} />
          {fieldErrors.ccv ? <p className={fieldErrorClass}>{fieldErrors.ccv}</p> : null}
        </div>
      </div>

      <h2 className="mt-9 text-lg font-bold text-slate-950">Titular do cartão</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="holder-name">Nome completo</label>
          <input id="holder-name" required autoComplete="name" className={fieldClass('holderName')} value={holder.name} aria-invalid={Boolean(fieldErrors.holderName)} onChange={(e) => { clearFieldError('holderName'); setHolder((current) => ({ ...current, name: e.target.value })) }} />
          {fieldErrors.holderName ? <p className={fieldErrorClass}>{fieldErrors.holderName}</p> : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="holder-email">E-mail</label>
          <input id="holder-email" required type="email" autoComplete="email" className={fieldClass('holderEmail')} value={holder.email} aria-invalid={Boolean(fieldErrors.holderEmail)} onChange={(e) => { clearFieldError('holderEmail'); setHolder((current) => ({ ...current, email: e.target.value })) }} />
          {fieldErrors.holderEmail ? <p className={fieldErrorClass}>{fieldErrors.holderEmail}</p> : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="holder-tax">CPF/CNPJ</label>
          <input id="holder-tax" required inputMode="numeric" className={fieldClass('holderTaxId')} value={holder.cpfCnpj} aria-invalid={Boolean(fieldErrors.holderTaxId)} onChange={(e) => { clearFieldError('holderTaxId'); setHolder((current) => ({ ...current, cpfCnpj: formatCpfCnpj(e.target.value) })) }} placeholder="000.000.000-00" maxLength={18} />
          {fieldErrors.holderTaxId ? <p className={fieldErrorClass}>{fieldErrors.holderTaxId}</p> : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="holder-phone">Celular</label>
          <input id="holder-phone" inputMode="tel" autoComplete="tel" className={fieldClass('mobilePhone')} value={holder.mobilePhone} aria-invalid={Boolean(fieldErrors.mobilePhone)} onChange={(e) => { clearFieldError('mobilePhone'); setHolder((current) => ({ ...current, mobilePhone: formatPhone(e.target.value) })) }} placeholder="(12) 99999-9999" maxLength={15} />
          {fieldErrors.mobilePhone ? <p className={fieldErrorClass}>{fieldErrors.mobilePhone}</p> : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="holder-cep">CEP</label>
          <input id="holder-cep" required inputMode="numeric" autoComplete="postal-code" className={fieldClass('postalCode')} value={holder.postalCode} aria-invalid={Boolean(fieldErrors.postalCode)} onChange={(e) => { clearFieldError('postalCode'); setHolder((current) => ({ ...current, postalCode: formatPostalCode(e.target.value) })) }} placeholder="00000-000" maxLength={9} />
          {fieldErrors.postalCode ? <p className={fieldErrorClass}>{fieldErrors.postalCode}</p> : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="holder-number">Número do endereço</label>
          <input id="holder-number" required className={fieldClass('addressNumber')} value={holder.addressNumber} aria-invalid={Boolean(fieldErrors.addressNumber)} onChange={(e) => { clearFieldError('addressNumber'); setHolder((current) => ({ ...current, addressNumber: e.target.value.slice(0, 20) })) }} />
          {fieldErrors.addressNumber ? <p className={fieldErrorClass}>{fieldErrors.addressNumber}</p> : null}
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="holder-complement">Complemento <span className="font-normal text-slate-500">(opcional)</span></label>
          <input id="holder-complement" className={inputClass} value={holder.addressComplement} onChange={(e) => setHolder((current) => ({ ...current, addressComplement: e.target.value.slice(0, 80) }))} />
        </div>
      </div>

      <label className="mt-7 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 text-sm leading-6 text-slate-700">
        <input type="checkbox" checked={accepted} onChange={(e) => { setAccepted(e.target.checked); if (e.target.checked) setError('') }} className="mt-1 h-4 w-4" />
        <span>Ao continuar, você autoriza a cobrança recorrente do BALCÃO de R$ 5,99 todo dia 1, conforme as condições apresentadas acima.</span>
      </label>

      <p className="mt-4 text-xs leading-5 text-slate-500">Os dados completos do cartão são enviados diretamente ao Asaas pelo servidor do BALCÃO e não são armazenados no nosso banco de dados.</p>
      {error ? <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
        <p>{error}</p>
        {Object.keys(fieldErrors).length ? <ul className="mt-2 list-disc space-y-1 pl-5 font-medium">{Object.entries(fieldErrors).map(([field, message]) => <li key={field}>{message}</li>)}</ul> : null}
      </div> : null}

      <div className="mt-7 flex justify-end">
        <button type="submit" disabled={busy || !accepted} className="min-h-12 rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Configurando…' : 'Continuar para conectar o banco'}</button>
      </div>
    </form>
  </div>
}
