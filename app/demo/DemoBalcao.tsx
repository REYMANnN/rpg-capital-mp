'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bot, FlaskConical, UserRound } from 'lucide-react'
import InventoryV1 from '@/app/inventory-v1/InventoryV1'
import {
  DEMO_INVENTORY_STORAGE_KEY,
  DEMO_STORAGE_KEY,
  createDemoFinanceDashboard,
  createDemoPixCharge,
  createDemoStoreData,
  type DemoStoreData,
} from '@/lib/demo/balcao'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function installDemoSandbox() {
  const storagePrototype = Storage.prototype
  const originalGetItem = storagePrototype.getItem
  const originalSetItem = storagePrototype.setItem
  const originalRemoveItem = storagePrototype.removeItem
  const originalClear = storagePrototype.clear
  const originalFetch = window.fetch.bind(window)

  const readDemo = () => {
    const raw = originalGetItem.call(window.sessionStorage, DEMO_STORAGE_KEY)
    if (raw) {
      try { return JSON.parse(raw) as DemoStoreData } catch {}
    }
    const seed = createDemoStoreData()
    originalSetItem.call(window.sessionStorage, DEMO_STORAGE_KEY, JSON.stringify(seed))
    return seed
  }

  const writeDemo = (state: DemoStoreData) => {
    originalSetItem.call(window.sessionStorage, DEMO_STORAGE_KEY, JSON.stringify(state))
  }

  readDemo()

  storagePrototype.getItem = function (key: string) {
    if (this === window.localStorage && key === DEMO_INVENTORY_STORAGE_KEY) {
      return originalGetItem.call(window.sessionStorage, DEMO_STORAGE_KEY)
    }
    return originalGetItem.call(this, key)
  }

  storagePrototype.setItem = function (key: string, value: string) {
    if (this === window.localStorage && key === DEMO_INVENTORY_STORAGE_KEY) {
      return originalSetItem.call(window.sessionStorage, DEMO_STORAGE_KEY, value)
    }
    return originalSetItem.call(this, key, value)
  }

  storagePrototype.removeItem = function (key: string) {
    if (this === window.localStorage && key === DEMO_INVENTORY_STORAGE_KEY) {
      return originalRemoveItem.call(window.sessionStorage, DEMO_STORAGE_KEY)
    }
    return originalRemoveItem.call(this, key)
  }

  storagePrototype.clear = function () {
    if (this === window.localStorage) {
      originalRemoveItem.call(window.sessionStorage, DEMO_STORAGE_KEY)
      return
    }
    return originalClear.call(this)
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const url = new URL(requestUrl, window.location.origin)
    const method = (init?.method || (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET') || 'GET').toUpperCase()

    if (url.origin === window.location.origin && url.pathname === '/api/inventory/state') {
      if (method === 'PUT') {
        try {
          const text = typeof init?.body === 'string' ? init.body : ''
          const state = JSON.parse(text) as DemoStoreData
          writeDemo(state)
          return jsonResponse({ ok: true, demo: true })
        } catch {
          return jsonResponse({ ok: false, error: 'Estado de demonstração inválido.' }, 400)
        }
      }
      return jsonResponse({ ok: true, found: true, state: readDemo(), demo: true })
    }

    if (url.origin === window.location.origin && url.pathname === '/api/balcao/finance/dashboard') {
      const requestedDays = Number(url.searchParams.get('days') || 30)
      const days = requestedDays === 7 || requestedDays === 90 ? requestedDays : 30
      return jsonResponse({ ok: true, dashboard: createDemoFinanceDashboard(days, readDemo()), demo: true })
    }

    if (url.origin === window.location.origin && url.pathname === '/api/balcao/checkout/pix') {
      let amountCents = 0
      try {
        const text = typeof init?.body === 'string' ? init.body : '{}'
        amountCents = Number(JSON.parse(text)?.amountCents || 0)
      } catch {}
      return jsonResponse({ ...createDemoPixCharge(amountCents), demo: true })
    }

    if (
      url.origin === window.location.origin &&
      (url.pathname.startsWith('/api/balcao/finance/connections') || url.pathname.startsWith('/api/balcao/open-finance'))
    ) {
      return jsonResponse({ ok: false, demo: true, error: 'Conexões bancárias reais ficam desativadas na conta de teste.' }, 409)
    }

    return originalFetch(input, init)
  }

  return () => {
    storagePrototype.getItem = originalGetItem
    storagePrototype.setItem = originalSetItem
    storagePrototype.removeItem = originalRemoveItem
    storagePrototype.clear = originalClear
    window.fetch = originalFetch
  }
}

export default function DemoBalcao() {
  const root = useRef<HTMLDivElement>(null)
  const restore = useRef<null | (() => void)>(null)
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null)
  const [navTarget, setNavTarget] = useState<HTMLElement | null>(null)

  if (typeof window !== 'undefined' && !restore.current) restore.current = installDemoSandbox()

  useEffect(() => {
    const header = root.current?.querySelector('header') as HTMLElement | null
    const nav = root.current?.querySelector('nav') as HTMLElement | null
    setHeaderTarget(header)
    setNavTarget(nav)

    const buttons = Array.from(nav?.querySelectorAll('button') ?? []) as HTMLButtonElement[]
    const settingsButton = buttons.find((button) => (button.textContent || '').toLocaleLowerCase('pt-BR').includes('ajustes'))
    if (settingsButton) settingsButton.style.display = 'none'

    return () => {
      if (restore.current) restore.current()
      restore.current = null
    }
  }, [])

  const automationNav = navTarget ? createPortal(
    <button type="button" aria-label="Abrir Automações da demonstração" onClick={() => window.location.assign('/demo/automations')}>
      <Bot />Automações
    </button>,
    navTarget,
  ) : null

  const demoIdentity = headerTarget ? createPortal(
    <div className="ml-3 flex items-center gap-2 font-sans">
      <span className="hidden items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 text-xs font-black text-emerald-100 sm:inline-flex">
        <FlaskConical className="h-3.5 w-3.5" />DEMONSTRAÇÃO
      </span>
      <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-sm font-bold text-white">
        <UserRound className="h-4 w-4" /><span className="hidden sm:inline">Gerente Demo</span>
      </span>
    </div>,
    headerTarget,
  ) : null

  return <div ref={root} data-balcao-demo="true"><InventoryV1 />{automationNav}{demoIdentity}</div>
}
