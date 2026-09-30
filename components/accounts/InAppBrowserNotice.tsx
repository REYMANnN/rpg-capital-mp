'use client'

import { useState, useSyncExternalStore } from 'react'

import { isInAppBrowser } from '@/lib/in-app-browser'

const noopSubscribe = () => () => {}

export default function InAppBrowserNotice() {
  const ua = useSyncExternalStore(noopSubscribe, () => navigator.userAgent || '', () => '')
  const [copied, setCopied] = useState(false)
  if (!ua || !isInAppBrowser(ua)) return null
  const state = { android: /Android/i.test(ua), url: window.location.href }
  const chromeIntent = state.url.replace(/^https?:\/\//, 'intent://') + '#Intent;scheme=https;package=com.android.chrome;end'

  return <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
    <p className="font-semibold">Se o botão do Google não abrir, abra esta página no navegador.</p>
    <p className="mt-1">{state.android ? 'Toque em ⋮ no canto e escolha "Abrir no Chrome".' : 'Toque em ⋯ ou no ícone de compartilhar e escolha "Abrir no Safari".'}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {state.android ? <a href={chromeIntent} className="rounded-full bg-amber-900 px-4 py-2 font-semibold text-white">Abrir no Chrome</a> : null}
      <button onClick={async () => { try { await navigator.clipboard.writeText(state.url); setCopied(true) } catch {} }} className="rounded-full border border-amber-900 px-4 py-2 font-semibold">{copied ? 'Link copiado' : 'Copiar link'}</button>
    </div>
  </div>
}
