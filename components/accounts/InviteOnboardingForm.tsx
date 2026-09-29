'use client'

import { FormEvent, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCep, formatPhone, formatTaxId, isValidCnpj, isValidCpf, normalizeDigits, validatePixKey } from '@/lib/accounts/validation'
import { ONBOARDING_TERMS_VERSION } from '@/lib/legal/onboardingTerms'

const types = [
  ['mercadinho', 'Mercadinho / Mercearia'], ['supermercado', 'Supermercado'], ['conveniencia', 'Loja de conveniência'],
  ['distribuidora', 'Distribuidora'], ['farmacia', 'Farmácia'], ['emporio', 'Empório'], ['padaria', 'Padaria'],
  ['acougue', 'Açougue'], ['hortifruti', 'Hortifruti'], ['bebidas', 'Loja de bebidas'], ['petshop', 'Pet shop'],
  ['cosmeticos', 'Cosméticos / Perfumaria'], ['material_construcao', 'Material de construção'], ['papelaria', 'Papelaria'], ['outro', 'Outro'],
] as const

type FormState = {
  businessName: string
  businessType: string
  phone: string
  taxId: string
  pixKey: string
  cep: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
}

type FieldErrors = Partial<Record<keyof FormState | 'terms', string>>

export default function InviteOnboardingForm({ code, storeNameHint, inviteePhone }: { code: string; storeNameHint?: string | null; inviteePhone?: string | null }) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>({
    businessName: storeNameHint || '',
    businessType: 'mercadinho',
    phone: inviteePhone ? formatPhone(inviteePhone) : '',
    taxId: '',
    pixKey: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
  })
  const [showPix, setShowPix] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cepMessage, setCepMessage] = useState('')
  const lastCepRef = useRef('')
  const addressNumberRef = useRef<HTMLInputElement>(null)

  const set = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }; delete next[key]; return next
    })
  }

  function validate() {
    const errors: FieldErrors = {}
    if (form.businessName.trim().length < 2) errors.businessName = 'Informe o nome da sua loja.'
    if (!form.businessType) errors.businessType = 'Escolha o tipo do negócio.'
    const phone = normalizeDigits(form.phone)
    if (phone.length < 10 || phone.length > 11) errors.phone = 'Digite DDD + telefone.'
    if (!isValidCpf(form.taxId) && !isValidCnpj(form.taxId)) errors.taxId = 'Informe um CPF ou CNPJ válido.'
    if (form.pixKey && !validatePixKey(form.pixKey)) errors.pixKey = 'Confira a chave Pix.'
    if (normalizeDigits(form.cep).length !== 8) errors.cep = 'Digite os 8 números do CEP.'
    if (form.street.trim().length < 2) errors.street = 'Informe a rua ou avenida.'
    if (!form.number.trim()) errors.number = 'Informe o número. Se não houver, use “S/N”.'
    if (form.city.trim().length < 2) errors.city = 'Informe a cidade.'
    if (form.state.trim().length !== 2) errors.state = 'Informe a UF.'
    if (!accepted) errors.terms = 'Você precisa aceitar os termos para criar a conta.'
    return errors
  }

  async function lookupCep(value: string) {
    const cep = normalizeDigits(value)
    if (cep.length !== 8 || cep === lastCepRef.current) return
    lastCepRef.current = cep
    setCepMessage('Buscando endereço…')
    try {
      const response = await fetch(`/api/balcao/cep/${cep}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) { setCepMessage(payload.error || 'CEP não encontrado. Preencha manualmente.'); return }
      setForm((current) => ({
        ...current,
        street: typeof payload.street === 'string' ? payload.street : current.street,
        neighborhood: typeof payload.neighborhood === 'string' ? payload.neighborhood : current.neighborhood,
        city: typeof payload.city === 'string' ? payload.city : current.city,
        state: typeof payload.state === 'string' ? payload.state : current.state,
      }))
      setCepMessage('Endereço encontrado. Confira os dados.')
      window.setTimeout(() => addressNumberRef.current?.focus(), 50)
    } catch {
      setCepMessage('Não conseguimos consultar o CEP. Preencha o endereço manualmente.')
    }
  }

  function handleCep(value: string) {
    const masked = formatCep(value)
    set('cep', masked)
    if (normalizeDigits(masked).length < 8) { lastCepRef.current = ''; setCepMessage(''); return }
    void lookupCep(masked)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const errors = validate()
    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      const first = Object.keys(errors)[0]
      if (first) window.setTimeout(() => document.getElementById(first)?.focus(), 0)
      return
    }

    setBusy(true); setServerError(''); setFieldErrors({})
    try {
      const response = await fetch('/api/balcao/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          pixType: '',
          referralSource: 'convite',
          referralOther: code,
          termsAccepted: true,
          termsVersion: ONBOARDING_TERMS_VERSION,
        }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string; field?: string }
      if (!response.ok) {
        if (payload.field && payload.field in form) setFieldErrors({ [payload.field]: payload.error || 'Confira este campo.' } as FieldErrors)
        else setServerError(payload.error || 'Não conseguimos criar sua conta. Tente novamente.')
        setBusy(false)
        return
      }
      router.replace('/onboarding?step=bank')
      router.refresh()
    } catch {
      setServerError('Não conseguimos criar sua conta agora. Tente novamente.')
      setBusy(false)
    }
  }

  const field = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100'
  const label = 'mb-2 block text-sm font-semibold text-slate-800'
  const error = (key: keyof FieldErrors) => fieldErrors[key] ? <p className="mt-1 text-sm font-medium text-rose-700">{fieldErrors[key]}</p> : null

  return <div className="mx-auto w-full max-w-3xl">
    <header className="mb-7 px-1">
      <p className="text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO · CONVITE</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Crie sua conta</h1>
      <p className="mt-2 text-slate-600">Um formulário só. Sem cartão.</p>
    </header>

    <form onSubmit={submit} noValidate className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-xl font-bold">Sua loja</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div><label className={label} htmlFor="businessName">Nome da loja</label><input id="businessName" autoFocus className={field} value={form.businessName} onChange={(e) => set('businessName', e.target.value.slice(0, 120))} />{error('businessName')}</div>
          <div><label className={label} htmlFor="businessType">Tipo de negócio</label><select id="businessType" className={field} value={form.businessType} onChange={(e) => set('businessType', e.target.value)}>{types.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>{error('businessType')}</div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-xl font-bold">Contato</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div><label className={label} htmlFor="phone">WhatsApp</label><input id="phone" inputMode="tel" className={field} value={form.phone} onChange={(e) => set('phone', formatPhone(e.target.value))} placeholder="(12) 99999-9999" /><p className="mt-1 text-sm text-slate-500">É por esse número que a Rafa vai te reconhecer.</p>{error('phone')}</div>
          <div><label className={label} htmlFor="taxId">CPF ou CNPJ</label><input id="taxId" inputMode="numeric" className={field} value={form.taxId} onChange={(e) => set('taxId', formatTaxId(e.target.value))} placeholder="000.000.000-00" />{error('taxId')}</div>
        </div>
        {!showPix ? <button type="button" onClick={() => setShowPix(true)} className="mt-5 text-sm font-semibold text-blue-700 underline underline-offset-4">Adicionar chave Pix</button> :
          <div className="mt-5"><label className={label} htmlFor="pixKey">Chave Pix <span className="font-normal text-slate-500">(opcional)</span></label><input id="pixKey" className={field} value={form.pixKey} onChange={(e) => set('pixKey', e.target.value)} />{error('pixKey')}</div>}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-xl font-bold">Endereço</h2>
        <div className="mt-5 max-w-xs"><label className={label} htmlFor="cep">CEP</label><input id="cep" inputMode="numeric" className={field} value={form.cep} onChange={(e) => handleCep(e.target.value)} placeholder="00000-000" maxLength={9} />{error('cep')}<p className="mt-1 text-sm text-slate-500">{cepMessage}</p></div>
        <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_150px]">
          <div><label className={label} htmlFor="street">Rua / Avenida</label><input id="street" className={field} value={form.street} onChange={(e) => set('street', e.target.value)} />{error('street')}</div>
          <div><label className={label} htmlFor="number">Número</label><input ref={addressNumberRef} id="number" className={field} value={form.number} onChange={(e) => set('number', e.target.value.slice(0, 20))} />{error('number')}</div>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div><label className={label} htmlFor="neighborhood">Bairro</label><input id="neighborhood" className={field} value={form.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} /></div>
          <div><label className={label} htmlFor="complement">Complemento <span className="font-normal text-slate-500">(opcional)</span></label><input id="complement" className={field} value={form.complement} onChange={(e) => set('complement', e.target.value.slice(0, 120))} /></div>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_120px]">
          <div><label className={label} htmlFor="city">Cidade</label><input id="city" className={field} value={form.city} onChange={(e) => set('city', e.target.value)} />{error('city')}</div>
          <div><label className={label} htmlFor="state">UF</label><input id="state" maxLength={2} className={field} value={form.state} onChange={(e) => set('state', e.target.value.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase())} />{error('state')}</div>
        </div>
      </section>

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-700">
        <input id="terms" type="checkbox" checked={accepted} onChange={(e) => { setAccepted(e.target.checked); setFieldErrors((current) => ({ ...current, terms: undefined })) }} className="mt-1 h-4 w-4" />
        <span>Li e concordo com os <a href="/termos" target="_blank" className="font-semibold text-blue-700 underline">Termos de Uso, Termos Comerciais, Uso de Dados e Uso de IA</a>.</span>
      </label>
      {error('terms')}
      {serverError && <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{serverError}</p>}
      <button type="submit" disabled={busy} className="min-h-14 w-full rounded-xl bg-blue-700 px-6 py-3 text-lg font-bold text-white disabled:opacity-50">{busy ? 'Criando sua conta…' : 'Criar minha conta'}</button>
    </form>
  </div>
}
