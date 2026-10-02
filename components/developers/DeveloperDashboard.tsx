'use client'

import { useMemo, useState } from 'react'

type AppRow = {
  id: string
  name: string
  website_url: string | null
  status: string
  created_at: string
  secrets: Array<{ id: string; name: string; prefix: string; scopes: string[]; created_at: string; last_used_at: string | null; revoked_at: string | null }>
  grants: Array<{ id: string; business_id: string; store_id: string; scopes: string[]; status: string; external_reference: string | null; created_at: string }>
}

const SCOPE_GROUPS = [
  ['Produtos', ['products:read', 'products:write']],
  ['Estoque', ['inventory:read', 'inventory:write']],
  ['Vendas', ['sales:read', 'sales:ingest']],
  ['Financeiro', ['finance:read']],
  ['Preços', ['pricing:read', 'pricing:write']],
  ['Webhooks', ['webhooks:manage']],
] as const

function ScopePicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  function toggle(scope: string) {
    onChange(value.includes(scope) ? value.filter((item) => item !== scope) : [...value, scope])
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {SCOPE_GROUPS.map(([label, scopes]) => (
        <fieldset key={label} className="rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-bold text-slate-900">{label}</legend>
          <div className="mt-2 grid gap-2">
            {scopes.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={value.includes(scope)} onChange={() => toggle(scope)} />
                <code>{scope}</code>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  )
}

export default function DeveloperDashboard({ initialApps }: { initialApps: AppRow[] }) {
  const [apps, setApps] = useState(initialApps)
  const [selectedAppId, setSelectedAppId] = useState(initialApps[0]?.id ?? '')
  const [appName, setAppName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [secretScopes, setSecretScopes] = useState<string[]>(['products:read', 'inventory:read', 'sales:read'])
  const [connectScopes, setConnectScopes] = useState<string[]>(['products:read', 'inventory:read', 'sales:read'])
  const [externalReference, setExternalReference] = useState('')
  const [oneTimeSecret, setOneTimeSecret] = useState('')
  const [connectUrl, setConnectUrl] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const selected = useMemo(() => apps.find((app) => app.id === selectedAppId) ?? apps[0], [apps, selectedAppId])

  async function createApp() {
    setBusy(true); setMessage('')
    const response = await fetch('/api/developers/apps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: appName, websiteUrl }),
    })
    const payload = await response.json()
    setBusy(false)
    if (!response.ok) return setMessage(payload.error?.message ?? 'Não foi possível criar o aplicativo.')
    const app: AppRow = { ...payload.data, secrets: [], grants: [] }
    setApps((current) => [...current, app])
    setSelectedAppId(app.id)
    setAppName(''); setWebsiteUrl('')
  }

  async function createSecret() {
    if (!selected) return
    setBusy(true); setMessage(''); setOneTimeSecret('')
    const response = await fetch(`/api/developers/apps/${selected.id}/secrets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Default', scopes: secretScopes }),
    })
    const payload = await response.json()
    setBusy(false)
    if (!response.ok) return setMessage(payload.error?.message ?? 'Não foi possível gerar a chave.')
    setOneTimeSecret(payload.data.api_key)
    setApps((current) => current.map((app) => app.id === selected.id ? { ...app, secrets: [...app.secrets, { ...payload.data, last_used_at: null, revoked_at: null }] } : app))
  }

  async function createConnectionLink() {
    if (!selected) return
    setBusy(true); setMessage(''); setConnectUrl('')
    const response = await fetch(`/api/developers/apps/${selected.id}/connection-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scopes: connectScopes, externalReference }),
    })
    const payload = await response.json()
    setBusy(false)
    if (!response.ok) return setMessage(payload.error?.message ?? 'Não foi possível gerar o link.')
    setConnectUrl(payload.data.connect_url)
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <div><p className="text-xs font-bold tracking-[0.18em] text-blue-700">RPG</p><strong>for Developers</strong></div>
          <nav className="flex gap-4 text-sm font-semibold">
            <a href="/developers/docs" className="text-blue-700">Documentação</a>
            <a href="/integracoes" className="text-slate-600">Integrações</a>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between"><strong>Aplicativos</strong></div>
          <div className="grid gap-2">
            {apps.map((app) => (
              <button key={app.id} onClick={() => setSelectedAppId(app.id)} className={`rounded-xl px-3 py-3 text-left text-sm font-semibold ${selected?.id === app.id ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50'}`}>{app.name}</button>
            ))}
            {!apps.length ? <p className="text-sm leading-6 text-slate-500">Crie seu primeiro aplicativo para gerar credenciais e links de conexão.</p> : null}
          </div>
          <hr className="my-5 border-slate-200" />
          <input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="Nome do aplicativo" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://seusite.com" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={busy || appName.trim().length < 2} onClick={createApp} className="mt-3 w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">Criar aplicativo</button>
        </aside>

        <section className="grid gap-6">
          {selected ? (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Aplicativo</p>
                <h1 className="mt-2 text-3xl font-bold">{selected.name}</h1>
                <p className="mt-2 font-mono text-xs text-slate-500">{selected.id}</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-xl font-bold">1. Gerar chave API</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">A chave identifica seu aplicativo. Escolha o máximo de permissões que esta chave poderá usar. O lojista ainda precisa autorizar cada acesso.</p>
                <div className="mt-5"><ScopePicker value={secretScopes} onChange={setSecretScopes} /></div>
                <button disabled={busy || !secretScopes.length} onClick={createSecret} className="mt-5 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">Gerar chave</button>
                {oneTimeSecret ? (
                  <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <strong className="text-sm text-amber-950">Salve agora. Esta chave não será exibida novamente.</strong>
                    <code className="mt-3 block break-all rounded-lg bg-slate-950 p-3 text-xs text-white">{oneTimeSecret}</code>
                    <button className="mt-3 text-sm font-bold text-blue-700" onClick={() => navigator.clipboard.writeText(oneTimeSecret)}>Copiar chave</button>
                  </div>
                ) : null}
                {selected.secrets.length ? (
                  <div className="mt-5 grid gap-2">
                    {selected.secrets.map((secret) => <div key={secret.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm"><strong>{secret.name}</strong> · <code>rpg_dev_live_{secret.prefix}_••••</code><div className="mt-1 text-xs text-slate-500">{secret.scopes.join(', ')}</div></div>)}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-xl font-bold">2. Gerar link de conexão</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Escolha exatamente o que você quer pedir ao lojista. Ele verá cada permissão e poderá reduzir o acesso antes de autorizar.</p>
                <div className="mt-5"><ScopePicker value={connectScopes} onChange={setConnectScopes} /></div>
                <input value={externalReference} onChange={(e) => setExternalReference(e.target.value)} placeholder="Referência sua (opcional), ex.: customer_482" className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <button disabled={busy || !connectScopes.length} onClick={createConnectionLink} className="mt-4 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">Gerar link</button>
                {connectUrl ? (
                  <div className="mt-5 rounded-xl bg-blue-50 p-4">
                    <code className="block break-all text-xs text-blue-950">{connectUrl}</code>
                    <button className="mt-3 text-sm font-bold text-blue-700" onClick={() => navigator.clipboard.writeText(connectUrl)}>Copiar link</button>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-xl font-bold">3. Conexões autorizadas</h2>
                {!selected.grants.length ? <p className="mt-3 text-sm text-slate-500">Nenhuma loja conectada ainda.</p> : (
                  <div className="mt-4 grid gap-3">
                    {selected.grants.map((grant) => (
                      <article key={grant.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2"><strong>Connection ID</strong><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">{grant.status}</span></div>
                        <code className="mt-2 block text-xs">{grant.id}</code>
                        <p className="mt-2 text-xs text-slate-500">{grant.scopes.join(', ')}</p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-8"><h1 className="text-2xl font-bold">RPG for Developers</h1><p className="mt-3 text-slate-600">Crie um aplicativo para começar.</p></div>
          )}
          {message ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{message}</p> : null}
        </section>
      </div>
    </main>
  )
}
