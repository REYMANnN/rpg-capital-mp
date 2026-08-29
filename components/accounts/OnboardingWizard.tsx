'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

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

type FormState = {
  businessName: string; businessType: string; cep: string; street: string; number: string; complement: string;
  neighborhood: string; city: string; state: string; phone: string; taxId: string; pixKey: string;
  referralSource: string; referralOther: string
}

const initial: FormState = {
  businessName: '', businessType: 'mercadinho', cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '',
  phone: '', taxId: '', pixKey: '', referralSource: '', referralOther: '',
}

export default function OnboardingWizard({ userName }: { userName: string }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const total = 4
  const progress = useMemo(() => `${Math.min(step + 1, total)} de ${total}`, [step])

  const set = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }))

  function canContinue() {
    if (step === 0) return form.businessName.trim().length >= 2 && Boolean(form.businessType)
    if (step === 1) return form.cep.replace(/\D/g, '').length === 8 && form.street.trim().length >= 2 && form.number.trim() && form.city.trim().length >= 2 && form.state.trim().length === 2
    if (step === 2) return form.phone.replace(/\D/g, '').length >= 10 && form.taxId.replace(/\D/g, '').length >= 11
    return Boolean(form.referralSource) && (form.referralSource !== 'other' || form.referralOther.trim().length >= 2)
  }

  async function next(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!canContinue()) {
      setError('Confira os campos desta etapa antes de continuar.')
      return
    }
    if (step < 3) {
      setStep((value) => value + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setBusy(true)
    try {
      const response = await fetch('/api/balcao/onboarding', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Não conseguimos concluir seu cadastro.')
      router.replace('/manage')
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não conseguimos concluir seu cadastro.')
      setBusy(false)
    }
  }

  const labelClass = 'mb-2 block text-sm font-semibold text-slate-800'
  const inputClass = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100'

  return (
    <div className="mx-auto w-full max-w-xl">
      <header className="mb-7">
        <p className="text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
        <div className="mt-5 flex items-center justify-between gap-4 text-sm font-medium text-slate-600"><span>{progress}</span><span>{Math.round(((step + 1) / total) * 100)}%</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true"><div className="h-full rounded-full bg-blue-700 transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} /></div>
      </header>

      <form onSubmit={next} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {step === 0 ? <section>
          <h1 className="text-2xl font-bold">{userName ? `${userName.split(' ')[0]}, ` : ''}vamos criar sua loja.</h1>
          <p className="mt-2 text-base leading-7 text-slate-600">Comece pelo básico. Você poderá alterar essas informações depois.</p>
          <div className="mt-6"><label className={labelClass} htmlFor="businessName">Nome do negócio</label><input id="businessName" autoFocus className={inputClass} value={form.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="Ex.: Mercado São João" /></div>
          <div className="mt-5"><label className={labelClass} htmlFor="businessType">Tipo de negócio</label><select id="businessType" className={inputClass} value={form.businessType} onChange={(e) => set('businessType', e.target.value)}>{types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        </section> : null}

        {step === 1 ? <section>
          <h1 className="text-2xl font-bold">Onde fica sua loja?</h1><p className="mt-2 text-base leading-7 text-slate-600">Isso identifica a unidade correta quando você tiver mais de uma.</p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2"><div><label className={labelClass} htmlFor="cep">CEP</label><input id="cep" inputMode="numeric" className={inputClass} value={form.cep} onChange={(e) => set('cep', e.target.value)} /></div><div><label className={labelClass} htmlFor="number">Número</label><input id="number" inputMode="numeric" className={inputClass} value={form.number} onChange={(e) => set('number', e.target.value)} /></div></div>
          <div className="mt-5"><label className={labelClass} htmlFor="street">Endereço</label><input id="street" className={inputClass} value={form.street} onChange={(e) => set('street', e.target.value)} /></div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2"><div><label className={labelClass} htmlFor="neighborhood">Bairro <span className="font-normal text-slate-500">(opcional)</span></label><input id="neighborhood" className={inputClass} value={form.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} /></div><div><label className={labelClass} htmlFor="complement">Complemento <span className="font-normal text-slate-500">(opcional)</span></label><input id="complement" className={inputClass} value={form.complement} onChange={(e) => set('complement', e.target.value)} /></div></div>
          <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_110px]"><div><label className={labelClass} htmlFor="city">Cidade</label><input id="city" className={inputClass} value={form.city} onChange={(e) => set('city', e.target.value)} /></div><div><label className={labelClass} htmlFor="state">UF</label><input id="state" maxLength={2} autoCapitalize="characters" className={inputClass} value={form.state} onChange={(e) => set('state', e.target.value.toUpperCase())} /></div></div>
        </section> : null}

        {step === 2 ? <section>
          <h1 className="text-2xl font-bold">Informações do negócio</h1><p className="mt-2 text-base leading-7 text-slate-600">A chave Pix pode ser deixada em branco e configurada depois.</p>
          <div className="mt-6"><label className={labelClass} htmlFor="phone">Telefone / WhatsApp</label><input id="phone" inputMode="tel" autoComplete="tel" className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(12) 99999-9999" /></div>
          <div className="mt-5"><label className={labelClass} htmlFor="taxId">CPF ou CNPJ</label><input id="taxId" inputMode="numeric" className={inputClass} value={form.taxId} onChange={(e) => set('taxId', e.target.value)} /></div>
          <div className="mt-5"><label className={labelClass} htmlFor="pixKey">Chave Pix <span className="font-normal text-slate-500">(opcional)</span></label><input id="pixKey" className={inputClass} value={form.pixKey} onChange={(e) => set('pixKey', e.target.value)} /></div>
        </section> : null}

        {step === 3 ? <section>
          <h1 className="text-2xl font-bold">Como conheceu o BALCÃO?</h1><p className="mt-2 text-base leading-7 text-slate-600">É a última pergunta.</p>
          <fieldset className="mt-6 grid gap-3"><legend className="sr-only">Como conheceu o BALCÃO?</legend>{referralOptions.map(([value, label]) => <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-base ${form.referralSource === value ? 'border-blue-700 bg-blue-50' : 'border-slate-300'}`}><input className="h-5 w-5" type="radio" name="referral" value={value} checked={form.referralSource === value} onChange={() => set('referralSource', value)} />{label}</label>)}</fieldset>
          {form.referralSource === 'other' ? <div className="mt-5"><label className={labelClass} htmlFor="referralOther">Conte para a gente</label><input id="referralOther" className={inputClass} value={form.referralOther} onChange={(e) => set('referralOther', e.target.value)} /></div> : null}
        </section> : null}

        {error ? <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</p> : null}
        <div className="mt-8 flex gap-3">
          {step > 0 ? <button type="button" onClick={() => { setError(''); setStep((value) => value - 1) }} className="min-h-12 rounded-xl border border-slate-300 px-5 py-3 text-base font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Voltar</button> : null}
          <button type="submit" disabled={busy} className="min-h-12 flex-1 rounded-xl bg-blue-700 px-5 py-3 text-base font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-60">{busy ? 'Criando sua loja…' : step === 3 ? 'Concluir cadastro' : 'Continuar'}</button>
        </div>
      </form>
    </div>
  )
}
