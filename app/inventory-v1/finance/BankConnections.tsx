'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Landmark, Link2, Loader2, RefreshCw, ShieldCheck, Unplug } from 'lucide-react'

type Connection = {
  id: string
  provider: string
  itemId: string
  institutionName: string | null
  institutionLogoUrl: string | null
  status: 'pending' | 'active' | 'updating' | 'attention' | 'error' | 'disconnected'
  executionStatus: string | null
  consentExpiresAt: string | null
  lastSyncedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

type ConnectionsPayload = {
  ok?: boolean
  configured?: boolean
  canManage?: boolean
  connections?: Connection[]
  error?: string
}

type MalvoConnectHandle = { close?: () => void }
type MalvoConnectApi = {
  init: (options: {
    connectToken: string
    countries: string[]
    connectorTypes: string[]
    language: 'pt'
    includeSandbox: false
    onSuccess: (data: { item?: { id?: string } }) => void
    onError: (error: { code?: string; message?: string }) => void
    onClose: () => void
  }) => MalvoConnectHandle
}

declare global {
  interface Window { MalvoConnect?: MalvoConnectApi }
}

let widgetPromise: Promise<MalvoConnectApi> | null = null
function loadMalvoWidget() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Widget indisponível'))
  if (window.MalvoConnect) return Promise.resolve(window.MalvoConnect)
  if (widgetPromise) return widgetPromise
  widgetPromise = new Promise<MalvoConnectApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-malvo-connect="true"]')
    const script = existing || document.createElement('script')
    const finish = () => window.MalvoConnect ? resolve(window.MalvoConnect) : reject(new Error('Widget Malvo não carregou'))
    script.addEventListener('load', finish, { once: true })
    script.addEventListener('error', () => reject(new Error('Falha ao carregar o widget Malvo')), { once: true })
    if (!existing) {
      script.src = 'https://malvo.io/widget.js'
      script.async = true
      script.dataset.malvoConnect = 'true'
      document.head.appendChild(script)
    }
  })
  return widgetPromise
}

const dateTime = (value: string | null) => value
  ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : 'Ainda não sincronizada'

function statusMeta(status: Connection['status']) {
  switch (status) {
    case 'active': return { label: 'Conectada', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 }
    case 'updating': return { label: 'Atualizando', className: 'bg-blue-50 text-blue-700', icon: Loader2 }
    case 'attention': return { label: 'Precisa de atenção', className: 'bg-amber-50 text-amber-800', icon: AlertTriangle }
    case 'error': return { label: 'Erro de conexão', className: 'bg-rose-50 text-rose-700', icon: AlertTriangle }
    case 'disconnected': return { label: 'Desconectada', className: 'bg-slate-100 text-slate-600', icon: Link2 }
    default: return { label: 'Conectando', className: 'bg-slate-100 text-slate-700', icon: Loader2 }
  }
}

export default function BankConnections({
  onFinanceChanged,
  storeId,
  returnTo = 'finance',
}: {
  onFinanceChanged?: () => void
  storeId?: string
  returnTo?: 'finance' | 'onboarding'
}) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [configured, setConfigured] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [disconnectingId, setDisconnectingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function query() {
    return storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''
  }

  async function load() {
    setError('')
    try {
      const response = await fetch(`/api/balcao/finance/connections${query()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as ConnectionsPayload
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar as conexões.')
      setConnections(payload.connections || [])
      setConfigured(Boolean(payload.configured))
      setCanManage(Boolean(payload.canManage))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar as conexões.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    void loadMalvoWidget().catch(() => undefined)
  }, [storeId])

  const activeCount = useMemo(() => connections.filter((connection) => connection.status !== 'disconnected').length, [connections])

  async function connectBank() {
    if (!canManage || connecting) return
    setConnecting(true)
    setError('')
    setNotice('')
    try {
      const [widget, response] = await Promise.all([
        loadMalvoWidget(),
        fetch('/api/balcao/finance/malvo/connect-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId: storeId || null, returnTo }),
        }),
      ])
      const payload = await response.json().catch(() => ({})) as { accessToken?: string; error?: string }
      if (!response.ok || !payload.accessToken) throw new Error(payload.error || 'Não foi possível iniciar a conexão bancária.')

      widget.init({
        connectToken: payload.accessToken,
        countries: ['BR'],
        connectorTypes: ['BUSINESS_BANK', 'PERSONAL_BANK'],
        language: 'pt',
        includeSandbox: false,
        onSuccess: () => {
          setNotice('Autorização concluída. Estamos sincronizando os dados do banco.')
          window.setTimeout(() => { void load(); onFinanceChanged?.() }, 1500)
          window.setTimeout(() => { void load(); onFinanceChanged?.() }, 5000)
        },
        onError: (widgetError) => setError(widgetError.message || 'A conexão bancária não foi concluída.'),
        onClose: () => {
          setConnecting(false)
          window.setTimeout(() => { void load(); onFinanceChanged?.() }, 1000)
        },
      })
    } catch (caught) {
      setConnecting(false)
      setError(caught instanceof Error ? caught.message : 'Não foi possível iniciar a conexão bancária.')
    }
  }

  async function syncNow() {
    if (syncing) return
    setSyncing(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/balcao/finance/malvo/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: storeId || null }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Não foi possível sincronizar agora.')
      setNotice('Dados atualizados com o que a Malvo já recebeu dos bancos.')
      await load()
      onFinanceChanged?.()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível sincronizar agora.')
    } finally {
      setSyncing(false)
    }
  }

  async function disconnect(connection: Connection) {
    if (!canManage || disconnectingId) return
    const ok = window.confirm(`Desconectar ${connection.institutionName || 'esta conta'}? O consentimento Open Finance será revogado.`)
    if (!ok) return
    setDisconnectingId(connection.id)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/balcao/finance/connections/${encodeURIComponent(connection.id)}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Não foi possível desconectar a conta.')
      setNotice('Conta desconectada e consentimento Open Finance revogado.')
      await load()
      onFinanceChanged?.()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível desconectar a conta.')
    } finally {
      setDisconnectingId('')
    }
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl bg-slate-950 p-5 text-white shadow-lg sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Open Finance</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Conecte as contas do negócio</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">O Balcão recebe saldos e movimentações em modo somente leitura. A autorização acontece no ambiente do banco e da Malvo; o Balcão não recebe sua senha bancária.</p>
          </div>
          {canManage ? <button onClick={() => void connectBank()} disabled={connecting || !configured} className="min-h-11 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{connecting ? 'Abrindo conexão…' : 'Conectar conta bancária'}</button> : null}
        </div>
        <div className="mt-6 flex flex-wrap gap-3 border-t border-white/10 pt-5 text-xs text-slate-300">
          <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" />Somente leitura</span>
          <span className="inline-flex items-center gap-2"><Landmark className="h-4 w-4 text-sky-300" />{activeCount} conta(s) conectada(s)</span>
        </div>
      </section>

      {!configured ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><b>Integração pronta, faltam as credenciais do servidor.</b><p className="mt-1 text-xs leading-5 text-amber-800">Depois que o Client ID, Client Secret e o segredo do webhook forem configurados, o botão de conexão fica habilitado.</p></div> : null}
      {!canManage ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><b>Você pode consultar os dados financeiros.</b><p className="mt-1 text-xs leading-5 text-slate-500">Por segurança, somente a conta principal do negócio pode criar, renovar ou revogar consentimentos bancários.</p></div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{notice}</div> : null}
      {error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div> : null}

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">
          <div><h3 className="text-lg font-black text-slate-950">Contas e consentimentos</h3><p className="mt-1 text-xs text-slate-500">Estado da conexão com cada instituição financeira.</p></div>
          <button onClick={() => void syncNow()} disabled={syncing || !connections.some((connection) => connection.status !== 'disconnected') || !configured} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />Atualizar dados</button>
        </div>

        {loading ? <div className="grid min-h-40 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div> : connections.length ? <div className="divide-y divide-slate-100">
          {connections.map((connection) => {
            const status = statusMeta(connection.status)
            const StatusIcon = status.icon
            return <article key={connection.id} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
              <div className="flex min-w-0 items-center gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-slate-100">
                  {connection.institutionLogoUrl ? <img src={connection.institutionLogoUrl} alt="" className="h-8 w-8 object-contain" /> : <Landmark className="h-5 w-5 text-slate-500" />}
                </div>
                <div className="min-w-0"><b className="block truncate text-sm text-slate-950">{connection.institutionName || 'Instituição financeira'}</b><p className="mt-1 text-xs text-slate-500">Última sincronização: {dateTime(connection.lastSyncedAt)}</p>{connection.errorMessage ? <p className="mt-1 text-xs text-rose-600">{connection.errorMessage}</p> : null}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${status.className}`}><StatusIcon className={`h-3.5 w-3.5 ${connection.status === 'updating' || connection.status === 'pending' ? 'animate-spin' : ''}`} />{status.label}</span>
                {canManage && connection.status !== 'disconnected' ? <button onClick={() => void disconnect(connection)} disabled={disconnectingId === connection.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Unplug className="h-3.5 w-3.5" />{disconnectingId === connection.id ? 'Desconectando…' : 'Desconectar'}</button> : null}
              </div>
            </article>
          })}
        </div> : <div className="p-8 text-center sm:p-12"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100"><Link2 className="h-5 w-5 text-slate-500" /></div><h4 className="mt-4 text-base font-black text-slate-900">Nenhuma conta conectada</h4><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Conecte a conta bancária do negócio para trazer saldo, entradas, saídas e movimentações reais para o Financeiro.</p>{canManage ? <button onClick={() => void connectBank()} disabled={connecting || !configured} className="mt-5 min-h-11 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:opacity-40">Conectar conta bancária</button> : null}</div>}
      </section>
    </div>
  )
}
