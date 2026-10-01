'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, Smartphone } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/config'

type TapStatus = {
  connected: boolean
  merchant?: { sumup_merchant_code?: string; key_last4?: string; status?: string } | null
  devices: number
  apk_url: string
}

type PairResult = {
  code: string
  expires_in_s: number
  app_link: string
  apk_url: string
}

const edgeUrl = `${getSupabaseUrl()}/functions/v1/rpg-tap`

export default function TapToPaySetup({
  storeId,
  storeName,
  whatsappHref,
}: {
  storeId: string
  storeName: string
  whatsappHref: string
}) {
  const [status, setStatus] = useState<TapStatus | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [pair, setPair] = useState<PairResult | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [isIos, setIsIos] = useState(false)

  const connected = Boolean(status?.connected)
  const paired = (status?.devices || 0) > 0
  const ready = connected && paired

  useEffect(() => {
    setIsIos(/iPhone|iPad|iPod/i.test(navigator.userAgent))
    void loadStatus()
  }, [storeId])

  async function call(action: string, extra: Record<string, unknown> = {}) {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Sua sessão expirou. Entre de novo na RPG.')
    const response = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.access_token}`,
        apikey: getSupabasePublishableKey(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action, store_id: storeId, ...extra }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload?.ok === false) throw new Error(payload?.message || 'Não foi possível concluir esta etapa.')
    return payload
  }

  async function loadStatus() {
    setBusy((value) => value || 'status')
    setError('')
    try {
      const payload = await call('status')
      setStatus({
        connected: Boolean(payload.connected),
        merchant: payload.merchant || null,
        devices: Number(payload.devices || 0),
        apk_url: String(payload.apk_url || ''),
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível consultar o Tap to Pay.')
    } finally {
      setBusy('')
    }
  }

  async function connect() {
    if (!apiKey.trim() || busy) return
    setBusy('connect')
    setError('')
    try {
      await call('connect', { api_key: apiKey.trim() })
      setApiKey('')
      setShowKey(false)
      await loadStatus()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível conectar a SumUp.')
    } finally {
      setBusy('')
    }
  }

  async function generatePairCode() {
    if (busy) return
    setBusy('pair')
    setError('')
    try {
      const payload = await call('pair-code')
      setPair({
        code: String(payload.code),
        expires_in_s: Number(payload.expires_in_s || 900),
        app_link: String(payload.app_link || ''),
        apk_url: String(payload.apk_url || status?.apk_url || ''),
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível gerar o código de conexão.')
    } finally {
      setBusy('')
    }
  }

  const apkUrl = pair?.apk_url || status?.apk_url || ''
  const merchantLabel = useMemo(() => status?.merchant?.sumup_merchant_code || 'Conta SumUp', [status])

  if (!status && busy === 'status') {
    return <div className="mt-6 flex min-h-36 items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando configuração…</div>
  }

  return <div className="mt-6 space-y-5">
    {error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div> : null}

    <section className={`rounded-2xl border p-5 ${connected ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${connected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
          {connected ? <CheckCircle2 className="h-5 w-5" /> : <span className="font-black">1</span>}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">Conectar a SumUp</h2>
          {connected ? <>
            <p className="mt-1 text-sm text-emerald-900"><b>{merchantLabel}</b> conectada à {storeName}.</p>
            <p className="mt-1 text-xs text-emerald-800">A chave fica guardada no cofre criptografado da RPG e não aparece no aplicativo.</p>
          </> : <>
            <p className="mt-1 text-sm leading-6 text-slate-600">Para receber por aproximação, a loja precisa ter uma conta SumUp ativa.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <a href="https://me.sumup.com/" target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 hover:bg-slate-50">
                Não tenho SumUp <ExternalLink className="h-4 w-4" />
              </a>
              <button onClick={() => setShowKey((value) => !value)} className="min-h-12 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800">
                Já tenho SumUp
              </button>
            </div>
            {showKey ? <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-sm font-bold text-blue-950">Conectar esta conta</p>
              <p className="mt-1 text-xs leading-5 text-blue-900">Na SumUp: <b>Configurações → Para Desenvolvedores → Toolkit → API Keys → Create</b>. Copie a chave secreta que começa com <b>sup_sk_</b>.</p>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sup_sk_..."
                className="mt-3 min-h-12 w-full rounded-xl border border-blue-200 bg-white px-4 font-mono text-sm outline-none focus:border-blue-700"
              />
              <button onClick={() => void connect()} disabled={!apiKey.trim() || busy === 'connect'} className="mt-3 min-h-12 w-full rounded-xl bg-blue-700 px-4 text-sm font-bold text-white disabled:opacity-50">
                {busy === 'connect' ? 'Conectando…' : 'Conectar SumUp'}
              </button>
              <p className="mt-3 text-xs leading-5 text-blue-800">Neste piloto a conexão usa a chave da própria conta. A arquitetura já está pronta para trocar isso por OAuth quando a credencial de parceiro da SumUp estiver disponível.</p>
            </div> : null}
          </>}
        </div>
      </div>
    </section>

    <section className={`rounded-2xl border p-5 ${paired ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${paired ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
          {paired ? <CheckCircle2 className="h-5 w-5" /> : <span className="font-black">2</span>}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">Instalar o aplicativo RPG</h2>
          {isIos ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">O Tap to Pay da RPG neste piloto funciona em Android compatível. Você pode concluir esta etapa depois em um Android.</div> : null}
          <p className="mt-1 text-sm leading-6 text-slate-600">O aplicativo é usado somente na hora de encostar o cartão. Estoque, banco e Rafa continuam no site e no WhatsApp.</p>
          {connected ? <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {apkUrl ? <a href={apkUrl} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900">
              <Smartphone className="h-4 w-4" />Baixar RPG para Android
            </a> : null}
            <button onClick={() => void generatePairCode()} disabled={busy === 'pair'} className="min-h-12 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-50">
              {busy === 'pair' ? 'Gerando…' : paired ? 'Conectar outro Android' : 'Conectar este Android'}
            </button>
          </div> : <p className="mt-4 text-sm font-semibold text-slate-500">Conecte a SumUp primeiro.</p>}

          {pair ? <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Código de conexão</p>
            <p className="mt-2 font-mono text-4xl font-black tracking-[0.18em] text-slate-950">{pair.code}</p>
            <p className="mt-2 text-xs text-slate-500">Válido por 15 minutos.</p>
            {pair.app_link ? <a href={pair.app_link} className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-4 text-sm font-bold text-white">Abrir no aplicativo RPG</a> : null}
          </div> : null}

          {paired ? <p className="mt-4 text-sm font-semibold text-emerald-900">{status?.devices} aparelho(s) conectado(s).</p> : null}
        </div>
      </div>
    </section>

    {ready ? <section className="rounded-2xl border border-emerald-300 bg-emerald-600 p-5 text-white">
      <p className="text-lg font-black">Pronto para cobrar no cartão.</p>
      <p className="mt-1 text-sm text-emerald-50">Na Rafa: Vender → leia os produtos → Cobrar → Cartão. A RPG abre o aplicativo direto na cobrança.</p>
      <a href={whatsappHref} className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-white px-5 font-bold text-emerald-700">Voltar para a Rafa</a>
    </section> : null}
  </div>
}
