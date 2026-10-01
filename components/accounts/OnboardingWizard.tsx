'use client'

import { FormEvent, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  formatCep,
  formatPhone,
  formatPixKey,
  formatTaxId,
  isValidCnpj,
  isValidCpf,
  normalizeDigits,
  validatePixKeyForType,
  type PixKeyType,
} from '@/lib/accounts/validation'

const types = [
  ['mercadinho', 'Mercadinho / Mercearia'], ['supermercado', 'Supermercado'], ['conveniencia', 'Loja de conveniência'],
  ['distribuidora', 'Distribuidora'], ['farmacia', 'Farmácia'], ['emporio', 'Empório'], ['padaria', 'Padaria'],
  ['acougue', 'Açougue'], ['hortifruti', 'Hortifruti'], ['bebidas', 'Loja de bebidas'], ['petshop', 'Pet shop'],
  ['cosmeticos', 'Cosméticos / Perfumaria'], ['material_construcao', 'Material de construção'], ['papelaria', 'Papelaria'], ['outro', 'Outro'],
] as const

const referralOptions = [
  ['instagram', 'Instagram'], ['google', 'Google'], ['referral', 'Amigo ou indicação'], ['ai', 'Inteligência artificial'],
  ['youtube_tiktok', 'YouTube ou TikTok'], ['other', 'Outro'],
] as const

const pixTypes: Array<{ value: Exclude<PixKeyType, ''>; label: string; hint: string }> = [
  { value: 'cpf', label: 'CPF', hint: '000.000.000-00' },
  { value: 'cnpj', label: 'CNPJ', hint: '00.000.000/0000-00' },
  { value: 'phone', label: 'Telefone', hint: '(00) 00000-0000' },
  { value: 'email', label: 'E-mail', hint: 'voce@empresa.com.br' },
  { value: 'evp', label: 'Chave aleatória', hint: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
]

type FormState = {
  businessName: string
  businessType: string
  cep: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
  phone: string
  taxId: string
  pixType: PixKeyType
  pixKey: string
  referralSource: string
  referralOther: string
}

type FieldErrors = Partial<Record<keyof FormState, string>>
type CepState = { status: 'idle' | 'loading' | 'success' | 'error'; message: string }

const initial: FormState = {
  businessName: '', businessType: 'mercadinho', cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '',
  phone: '', taxId: '', pixType: '', pixKey: '', referralSource: '', referralOther: '',
}

export default function OnboardingWizard({ userName }: { userName: string }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormState>(initial)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cepState, setCepState] = useState<CepState>({ status: 'idle', message: '' })
  const addressNumberRef = useRef<HTMLInputElement>(null)
  const lastCepRef = useRef('')
  const cepRequestRef = useRef(0)
  const total = 4
  const progress = useMemo(() => `${Math.min(step + 1, total)} de ${total}`, [step])

  function set(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function focusFirstInvalid(errors: FieldErrors) {
    const first = Object.keys(errors)[0]
    if (!first) return
    window.setTimeout(() => document.getElementById(first)?.focus(), 0)
  }

  function validateStep(): FieldErrors {
    const errors: FieldErrors = {}

    if (step === 0) {
      if (form.businessName.trim().length < 2) errors.businessName = 'Informe o nome da sua loja.'
      if (!form.businessType) errors.businessType = 'Escolha o tipo do negócio.'
    }

    if (step === 1) {
      if (normalizeDigits(form.cep).length !== 8) errors.cep = 'Digite os 8 números do CEP.'
      if (form.street.trim().length < 2) errors.street = 'Informe a rua ou avenida.'
      if (!form.number.trim()) errors.number = 'Informe o número. Se não houver, use “S/N”.'
      if (form.city.trim().length < 2) errors.city = 'Informe a cidade.'
      if (form.state.trim().length !== 2) errors.state = 'Informe a UF com 2 letras.'
    }

    if (step === 2) {
      const phoneDigits = normalizeDigits(form.phone)
      if (phoneDigits.length < 10 || phoneDigits.length > 11) errors.phone = 'Digite DDD + telefone, com 10 ou 11 números.'
      if (!isValidCpf(form.taxId) && !isValidCnpj(form.taxId)) errors.taxId = 'Informe um CPF ou CNPJ válido.'
      if (form.pixKey && (!form.pixType || !validatePixKeyForType(form.pixType, form.pixKey))) {
        errors.pixKey = 'Confira a chave Pix para o tipo selecionado.'
      }
    }

    if (step === 3) {
      if (!form.referralSource) errors.referralSource = 'Escolha uma opção.'
      if (form.referralSource === 'other' && form.referralOther.trim().length < 2) errors.referralOther = 'Conte como você conheceu o BALCÃO.'
    }

    return errors
  }

  async function lookupCep(maskedCep: string) {
    const cep = normalizeDigits(maskedCep)
    if (cep.length !== 8 || cep === lastCepRef.current) return

    lastCepRef.current = cep
    const requestId = ++cepRequestRef.current
    setCepState({ status: 'loading', message: 'Buscando endereço…' })

    try {
      const response = await fetch(`/api/balcao/cep/${cep}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (requestId !== cepRequestRef.current) return

      if (!response.ok) {
        setCepState({ status: 'error', message: payload.error || 'CEP não encontrado. Preencha o endereço manualmente.' })
        return
      }

      setForm((current) => ({
        ...current,
        street: typeof payload.street === 'string' ? payload.street : current.street,
        neighborhood: typeof payload.neighborhood === 'string' ? payload.neighborhood : current.neighborhood,
        city: typeof payload.city === 'string' ? payload.city : current.city,
        state: typeof payload.state === 'string' ? payload.state : current.state,
      }))
      setFieldErrors((current) => {
        const next = { ...current }
        delete next.street
        delete next.neighborhood
        delete next.city
        delete next.state
        return next
      })
      setCepState({ status: 'success', message: 'Endereço encontrado. Confira e informe o número.' })
      window.setTimeout(() => addressNumberRef.current?.focus(), 50)
    } catch {
      if (requestId !== cepRequestRef.current) return
      setCepState({ status: 'error', message: 'Não conseguimos consultar o CEP agora. Você pode preencher o endereço manualmente.' })
    }
  }

  function handleCep(value: string) {
    const masked = formatCep(value)
    set('cep', masked)
    const digits = normalizeDigits(masked)
    if (digits.length < 8) {
      lastCepRef.current = ''
      cepRequestRef.current += 1
      setCepState({ status: 'idle', message: '' })
      return
    }
    void lookupCep(masked)
  }

  function choosePixType(type: Exclude<PixKeyType, ''>) {
    setForm((current) => ({ ...current, pixType: type, pixKey: current.pixType === type ? current.pixKey : '' }))
    setFieldErrors((current) => {
      const next = { ...current }
      delete next.pixType
      delete next.pixKey
      return next
    })
  }

  function clearPix() {
    setForm((current) => ({ ...current, pixType: '', pixKey: '' }))
    setFieldErrors((current) => {
      const next = { ...current }
      delete next.pixType
      delete next.pixKey
      return next
    })
  }

  async function next(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setServerError('')

    const errors = validateStep()
    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      focusFirstInvalid(errors)
      return
    }

    setFieldErrors({})
    if (step < 3) {
      setStep((value) => value + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setBusy(true)
    try {
      const response = await fetch('/api/balcao/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (payload.field && typeof payload.field === 'string') {
          const field = payload.field as keyof FormState
          const errorsFromServer: FieldErrors = { [field]: payload.error || 'Confira este campo.' }
          setFieldErrors(errorsFromServer)
          focusFirstInvalid(errorsFromServer)
        } else {
          setServerError(payload.error || 'Não conseguimos concluir seu cadastro. Seus dados foram mantidos; tente novamente.')
        }
        setBusy(false)
        return
      }

      router.replace('/manage')
      router.refresh()
    } catch {
      setServerError('Não conseguimos concluir seu cadastro agora. Seus dados foram mantidos; tente novamente.')
      setBusy(false)
    }
  }

  const labelClass = 'mb-2 block text-sm font-semibold text-slate-800'
  const inputClass = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-blue-700 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50'
  const errorClass = 'mt-2 text-sm font-medium text-red-700'
  const helpClass = 'mt-2 text-sm leading-5 text-slate-500'

  function fieldError(field: keyof FormState) {
    const message = fieldErrors[field]
    return message ? <p id={`${field}-error`} role="alert" className={errorClass}>{message}</p> : null
  }

  function invalid(field: keyof FormState) {
    return Boolean(fieldErrors[field])
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-7 px-1">
        <p className="text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
        <div className="mt-5 flex items-center justify-between gap-4 text-sm font-medium text-slate-600">
          <span>Etapa {progress}</span><span>{Math.round(((step + 1) / total) * 100)}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
          <div className="h-full rounded-full bg-blue-700 transition-all duration-300" style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
      </header>

      <form onSubmit={next} noValidate className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        {step === 0 ? <section aria-labelledby="step-title">
          <p className="text-sm font-semibold text-blue-700">Sua loja</p>
          <h1 id="step-title" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{userName ? `${userName.split(' ')[0]}, ` : ''}vamos começar pelo básico.</h1>
          <p className="mt-3 text-base leading-7 text-slate-600">Só precisamos saber qual negócio você está configurando. Dá para alterar depois.</p>

          <div className="mt-7">
            <label className={labelClass} htmlFor="businessName">Nome do negócio</label>
            <input id="businessName" autoFocus autoComplete="organization" className={inputClass} value={form.businessName} aria-invalid={invalid('businessName')} aria-describedby={invalid('businessName') ? 'businessName-error' : undefined} onChange={(e) => set('businessName', e.target.value.slice(0, 120))} placeholder="Ex.: Mercado São João" />
            {fieldError('businessName')}
          </div>

          <div className="mt-5">
            <label className={labelClass} htmlFor="businessType">Tipo de negócio</label>
            <select id="businessType" className={inputClass} value={form.businessType} aria-invalid={invalid('businessType')} onChange={(e) => set('businessType', e.target.value)}>
              {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {fieldError('businessType')}
          </div>
        </section> : null}

        {step === 1 ? <section aria-labelledby="step-title">
          <p className="text-sm font-semibold text-blue-700">Endereço</p>
          <h1 id="step-title" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Onde fica sua loja?</h1>
          <p className="mt-3 text-base leading-7 text-slate-600">Digite o CEP e o BALCÃO tenta preencher o restante para você.</p>

          <div className="mt-7 max-w-xs">
            <label className={labelClass} htmlFor="cep">CEP</label>
            <input id="cep" inputMode="numeric" autoComplete="postal-code" className={inputClass} value={form.cep} aria-invalid={invalid('cep')} aria-describedby={invalid('cep') ? 'cep-error' : 'cep-help'} onChange={(e) => handleCep(e.target.value)} placeholder="00000-000" maxLength={9} />
            {fieldError('cep')}
            <p id="cep-help" aria-live="polite" className={`mt-2 text-sm font-medium ${cepState.status === 'error' ? 'text-amber-700' : cepState.status === 'success' ? 'text-emerald-700' : 'text-slate-500'}`}>{cepState.message || 'Só os números — o traço aparece sozinho.'}</p>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-[1fr_150px]">
            <div>
              <label className={labelClass} htmlFor="street">Rua / Avenida</label>
              <input id="street" autoComplete="address-line1" className={inputClass} value={form.street} aria-invalid={invalid('street')} onChange={(e) => set('street', e.target.value)} placeholder="Ex.: Av. Paulista" />
              {fieldError('street')}
            </div>
            <div>
              <label className={labelClass} htmlFor="number">Número</label>
              <input ref={addressNumberRef} id="number" autoComplete="address-line2" className={inputClass} value={form.number} aria-invalid={invalid('number')} onChange={(e) => set('number', e.target.value.slice(0, 20))} placeholder="123" />
              {fieldError('number')}
            </div>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="neighborhood">Bairro <span className="font-normal text-slate-500">(opcional)</span></label>
              <input id="neighborhood" autoComplete="address-level3" className={inputClass} value={form.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="complement">Complemento <span className="font-normal text-slate-500">(opcional)</span></label>
              <input id="complement" className={inputClass} value={form.complement} onChange={(e) => set('complement', e.target.value.slice(0, 120))} placeholder="Apto., sala, bloco…" />
            </div>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_120px]">
            <div>
              <label className={labelClass} htmlFor="city">Cidade</label>
              <input id="city" autoComplete="address-level2" className={inputClass} value={form.city} aria-invalid={invalid('city')} onChange={(e) => set('city', e.target.value)} />
              {fieldError('city')}
            </div>
            <div>
              <label className={labelClass} htmlFor="state">UF</label>
              <input id="state" autoComplete="address-level1" maxLength={2} autoCapitalize="characters" className={inputClass} value={form.state} aria-invalid={invalid('state')} onChange={(e) => set('state', e.target.value.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase())} placeholder="SP" />
              {fieldError('state')}
            </div>
          </div>
        </section> : null}

        {step === 2 ? <section aria-labelledby="step-title">
          <p className="text-sm font-semibold text-blue-700">Seus dados</p>
          <h1 id="step-title" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Agora os dados de contato e identificação.</h1>
          <p className="mt-3 text-base leading-7 text-slate-600">Você só digita os números. Pontos, espaços, parênteses e traços entram automaticamente.</p>

          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="phone">Telefone / WhatsApp</label>
              <input id="phone" inputMode="numeric" autoComplete="tel" className={inputClass} value={form.phone} aria-invalid={invalid('phone')} aria-describedby={invalid('phone') ? 'phone-error' : 'phone-help'} onChange={(e) => set('phone', formatPhone(e.target.value))} placeholder="(12) 99999-9999" maxLength={15} />
              {fieldError('phone')}
              {!invalid('phone') ? <p id="phone-help" className={helpClass}>DDD + número. A máscara aparece sozinha.</p> : null}
            </div>
            <div>
              <label className={labelClass} htmlFor="taxId">CPF ou CNPJ</label>
              <input id="taxId" inputMode="numeric" autoComplete="off" className={inputClass} value={form.taxId} aria-invalid={invalid('taxId')} aria-describedby={invalid('taxId') ? 'taxId-error' : 'taxId-help'} onChange={(e) => set('taxId', formatTaxId(e.target.value))} placeholder="CPF ou CNPJ" maxLength={18} />
              {fieldError('taxId')}
              {!invalid('taxId') ? <p id="taxId-help" className={helpClass}>O BALCÃO identifica CPF ou CNPJ pelo tamanho.</p> : null}
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Chave Pix <span className="font-normal text-slate-500">(opcional)</span></h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">Se quiser cadastrar agora, escolha o tipo. Caso contrário, continue normalmente.</p>
              </div>
              {form.pixType ? <button type="button" onClick={clearPix} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">Remover chave</button> : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Tipo da chave Pix">
              {pixTypes.map((option) => {
                const selected = form.pixType === option.value
                return <button key={option.value} type="button" onClick={() => choosePixType(option.value)} aria-pressed={selected} className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-semibold transition ${selected ? 'border-blue-700 bg-blue-50 text-blue-800 ring-2 ring-blue-100' : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400'}`}>{option.label}</button>
              })}
            </div>

            {form.pixType ? <div className="mt-5">
              <label className={labelClass} htmlFor="pixKey">{pixTypes.find((option) => option.value === form.pixType)?.label}</label>
              <input
                id="pixKey"
                inputMode={form.pixType === 'email' ? 'email' : form.pixType === 'evp' ? 'text' : 'numeric'}
                autoComplete={form.pixType === 'email' ? 'email' : form.pixType === 'phone' ? 'tel' : 'off'}
                className={inputClass}
                value={form.pixKey}
                aria-invalid={invalid('pixKey')}
                aria-describedby={invalid('pixKey') ? 'pixKey-error' : 'pixKey-help'}
                onChange={(e) => set('pixKey', formatPixKey(form.pixType, e.target.value))}
                placeholder={pixTypes.find((option) => option.value === form.pixType)?.hint}
              />
              {fieldError('pixKey')}
              {!invalid('pixKey') ? <p id="pixKey-help" className={helpClass}>{form.pixType === 'phone' ? 'Digite DDD + telefone. O +55 será salvo automaticamente.' : 'Você pode colar a chave; o BALCÃO ajusta o formato quando necessário.'}</p> : null}
            </div> : null}
          </div>
        </section> : null}

        {step === 3 ? <section aria-labelledby="step-title">
          <p className="text-sm font-semibold text-blue-700">Última etapa</p>
          <h1 id="step-title" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Como conheceu o BALCÃO?</h1>
          <p className="mt-3 text-base leading-7 text-slate-600">É só isso. Depois você entra na gestão da sua loja.</p>

          <fieldset id="referralSource" tabIndex={-1} aria-invalid={invalid('referralSource')} className="mt-7 grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Como conheceu o BALCÃO?</legend>
            {referralOptions.map(([value, label]) => <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-base transition ${form.referralSource === value ? 'border-blue-700 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-300 hover:border-slate-400'}`}>
              <input className="h-5 w-5" type="radio" name="referral" value={value} checked={form.referralSource === value} onChange={() => set('referralSource', value)} />{label}
            </label>)}
          </fieldset>
          {fieldError('referralSource')}

          {form.referralSource === 'other' ? <div className="mt-5">
            <label className={labelClass} htmlFor="referralOther">Conte para a gente</label>
            <input id="referralOther" className={inputClass} value={form.referralOther} aria-invalid={invalid('referralOther')} onChange={(e) => set('referralOther', e.target.value.slice(0, 240))} />
            {fieldError('referralOther')}
          </div> : null}

          <div className="mt-7 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            Ao concluir, sua conta Google ficará vinculada à gestão deste negócio. Você poderá alterar telefone, endereço e chave Pix depois.
          </div>
        </section> : null}

        {serverError ? <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-800">{serverError}</p> : null}

        <div className="mt-8 flex gap-3 border-t border-slate-100 pt-6">
          {step > 0 ? <button type="button" disabled={busy} onClick={() => { setServerError(''); setFieldErrors({}); setStep((value) => value - 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="min-h-12 rounded-xl border border-slate-300 px-5 py-3 text-base font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-60">Voltar</button> : null}
          <button type="submit" disabled={busy} className="min-h-12 flex-1 rounded-xl bg-blue-700 px-5 py-3 text-base font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-60">{busy ? 'Criando sua loja…' : step === 3 ? 'Concluir e entrar' : 'Continuar'}</button>
        </div>
      </form>
      <p className="mt-5 text-center text-xs leading-5 text-slate-500">Powered by RPG System</p>
    </div>
  )
}
