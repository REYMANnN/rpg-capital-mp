'use client'

import { useEffect, useState } from 'react'

type EventType =
  | 'page_view' | 'click' | 'pointer' | 'scroll' | 'heartbeat'
  | 'performance' | 'form_start' | 'form_submit_attempt' | 'form_submit_success'

type AnalyticsEvent = {
  type: EventType
  path: string
  section?: string | null
  target?: string | null
  x?: number | null
  y?: number | null
  scroll?: number | null
  value?: number | null
  meta?: Record<string, string | number | boolean | null>
}

declare global {
  interface Window {
    rpgTrack?: (type: EventType, data?: Partial<Omit<AnalyticsEvent, 'type' | 'path'>>) => void
  }
}

const CONSENT_KEY = 'rpg_analytics_consent_v1'
const VISITOR_KEY = 'rpg_analytics_visitor_v1'
const SESSION_KEY = 'rpg_analytics_session_v1'
const PUBLIC_PREFIXES = ['/', '/interesse', '/demo', '/privacidade', '/termos']
const POINTER_INTERVAL = 500
const MAX_POINTERS_PER_PAGE = 300

function allowedPath(path: string) {
  return PUBLIC_PREFIXES.some((prefix) => prefix === '/' ? path === '/' : path === prefix || path.startsWith(prefix + '/'))
}

function randomId() {
  return crypto.randomUUID()
}

function browserName(ua: string) {
  if (/Edg\//.test(ua)) return 'Edge'
  if (/OPR\//.test(ua)) return 'Opera'
  if (/Chrome\//.test(ua)) return 'Chrome'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari'
  return 'Outro'
}

function osName(ua: string) {
  if (/Windows NT/.test(ua)) return 'Windows'
  if (/Android/.test(ua)) return 'Android'
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'
  if (/Mac OS X/.test(ua)) return 'macOS'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Outro'
}

function deviceType(ua: string): 'desktop' | 'mobile' | 'tablet' | 'unknown' {
  if (/iPad|Tablet|Nexus 7|Nexus 10/i.test(ua)) return 'tablet'
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'mobile'
  return 'desktop'
}

function cleanText(value: string | null | undefined, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function sourceFrom(referrer: string, utmSource: string | null) {
  if (utmSource) return utmSource.slice(0, 180)
  if (!referrer) return 'direto'
  try { return new URL(referrer).hostname.replace(/^www\./, '').slice(0, 180) } catch { return 'referência' }
}

export default function PublicAnalytics() {
  const [consent, setConsent] = useState<'yes' | 'no' | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!allowedPath(location.pathname)) { setReady(true); return }
    const saved = localStorage.getItem(CONSENT_KEY)
    setConsent(saved === 'yes' ? 'yes' : saved === 'no' ? 'no' : null)
    setReady(true)
  }, [])

  useEffect(() => {
    if (consent !== 'yes' || !allowedPath(location.pathname)) return

    let visitorId = localStorage.getItem(VISITOR_KEY)
    if (!visitorId) {
      visitorId = randomId()
      localStorage.setItem(VISITOR_KEY, visitorId)
    }
    let sessionId = sessionStorage.getItem(SESSION_KEY)
    if (!sessionId) {
      sessionId = randomId()
      sessionStorage.setItem(SESSION_KEY, sessionId)
    }

    const params = new URLSearchParams(location.search)
    const utmSource = params.get('utm_source')
    const referrer = document.referrer || ''
    const ua = navigator.userAgent
    const context = {
      sessionId,
      visitorId,
      source: sourceFrom(referrer, utmSource),
      referrer: referrer.slice(0, 500) || null,
      utmSource,
      utmMedium: params.get('utm_medium'),
      utmCampaign: params.get('utm_campaign'),
      utmContent: params.get('utm_content'),
      utmTerm: params.get('utm_term'),
      deviceType: deviceType(ua),
      browser: browserName(ua),
      os: osName(ua),
      viewportWidth: Math.max(1, window.innerWidth),
      viewportHeight: Math.max(1, window.innerHeight),
      screenWidth: Math.max(1, screen.width),
      screenHeight: Math.max(1, screen.height),
      language: navigator.language || '—',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '—',
    }

    let queue: AnalyticsEvent[] = []
    let timer: ReturnType<typeof setTimeout> | null = null
    let pointerCount = 0
    let lastPointer = 0
    let lastActivity = Date.now()
    let formStarted = false
    const scrollMilestones = new Set<number>()

    function flush(beacon = false) {
      if (!queue.length) return
      const events = queue.splice(0, 50)
      const payload = JSON.stringify({ context, events })
      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon('/api/analytics/collect', new Blob([payload], { type: 'application/json' }))
      } else {
        fetch('/api/analytics/collect', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {})
      }
      if (queue.length) schedule()
    }

    function schedule() {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        flush()
      }, 3000)
    }

    function push(event: AnalyticsEvent) {
      queue.push(event)
      if (queue.length >= 20) flush()
      else schedule()
    }

    function sectionOf(target: Element | null) {
      const section = target?.closest('section[id]')
      return section?.id || (target?.closest('main') ? 'main' : null)
    }

    window.rpgTrack = (type, data = {}) => push({
      type,
      path: location.pathname,
      ...data,
    })

    push({ type: 'page_view', path: location.pathname, meta: { title: document.title.slice(0, 300) } })

    const activity = () => { lastActivity = Date.now() }
    const onClick = (event: MouseEvent) => {
      activity()
      const el = (event.target as Element | null)?.closest('a,button,[role="button"]') as HTMLElement | null
      const anchor = el?.closest('a') as HTMLAnchorElement | null
      let href = anchor?.getAttribute('href') || ''
      if (href.startsWith('http')) {
        try { href = new URL(href).hostname + new URL(href).pathname } catch {}
      }
      push({
        type: 'click',
        path: location.pathname,
        section: sectionOf(el),
        target: cleanText(el?.innerText || el?.getAttribute('aria-label') || href || el?.tagName, 180),
        x: Math.min(1, Math.max(0, event.clientX / Math.max(1, innerWidth))),
        y: Math.min(1, Math.max(0, (scrollY + event.clientY) / Math.max(1, document.documentElement.scrollHeight))),
        meta: { href: cleanText(href, 300), tag: el?.tagName || 'unknown' },
      })
    }

    const onPointer = (event: PointerEvent) => {
      activity()
      if (event.pointerType && event.pointerType !== 'mouse') return
      const now = Date.now()
      if (pointerCount >= MAX_POINTERS_PER_PAGE || now - lastPointer < POINTER_INTERVAL) return
      lastPointer = now
      pointerCount += 1
      const target = event.target as Element | null
      push({
        type: 'pointer',
        path: location.pathname,
        section: sectionOf(target),
        x: Math.min(1, Math.max(0, event.clientX / Math.max(1, innerWidth))),
        y: Math.min(1, Math.max(0, (scrollY + event.clientY) / Math.max(1, document.documentElement.scrollHeight))),
      })
    }

    const onScroll = () => {
      activity()
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight)
      const ratio = Math.min(1, Math.max(0, scrollY / max))
      for (const milestone of [25, 50, 75, 90, 100]) {
        if (ratio >= milestone / 100 && !scrollMilestones.has(milestone)) {
          scrollMilestones.add(milestone)
          push({ type: 'scroll', path: location.pathname, scroll: milestone / 100, value: milestone })
        }
      }
    }

    const onFocus = (event: FocusEvent) => {
      activity()
      const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
      if (!target?.closest('form') || formStarted) return
      formStarted = true
      push({ type: 'form_start', path: location.pathname, target: cleanText(target.closest('label')?.innerText || target.name || target.type, 120) })
    }

    const onSubmit = () => {
      activity()
      push({ type: 'form_submit_attempt', path: location.pathname })
      flush()
    }

    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastActivity < 30_000) {
        push({ type: 'heartbeat', path: location.pathname, value: 15 })
      }
    }, 15_000)

    const perfTimer = setTimeout(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (!nav) return
      push({
        type: 'performance',
        path: location.pathname,
        meta: {
          ttfb_ms: Math.round(nav.responseStart),
          dom_ms: Math.round(nav.domContentLoadedEventEnd),
          load_ms: Math.round(nav.loadEventEnd || nav.duration),
        },
      })
    }, 2500)

    const onPageHide = () => flush(true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('pointermove', onPointer, { passive: true })
    document.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('focusin', onFocus, true)
    document.addEventListener('submit', onSubmit, true)
    document.addEventListener('keydown', activity, { passive: true })
    document.addEventListener('touchstart', activity, { passive: true })
    window.addEventListener('pagehide', onPageHide)

    return () => {
      if (timer) clearTimeout(timer)
      clearInterval(heartbeat)
      clearTimeout(perfTimer)
      flush(true)
      delete window.rpgTrack
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('pointermove', onPointer)
      document.removeEventListener('scroll', onScroll)
      document.removeEventListener('focusin', onFocus, true)
      document.removeEventListener('submit', onSubmit, true)
      document.removeEventListener('keydown', activity)
      document.removeEventListener('touchstart', activity)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [consent])

  if (!ready || !allowedPath(typeof location === 'undefined' ? '/__server' : location.pathname) || consent !== null) return null

  return <div style={{
    position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 9999,
    maxWidth: 760, margin: '0 auto', borderRadius: 18, padding: 16,
    background: '#111827', color: '#fff', boxShadow: '0 18px 55px rgba(0,0,0,.25)',
    fontFamily: 'Arial, sans-serif',
  }}>
    <div style={{ fontSize: 14, lineHeight: 1.5 }}>
      <strong>Podemos analisar como o site é usado?</strong>
      <div style={{ marginTop: 4, color: '#cbd5e1' }}>
        Usamos dados de navegação, cliques, scroll e movimento do mouse para melhorar a RPG. Não gravamos o que você digita nos formulários.
      </div>
    </div>
    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
      <button onClick={() => { localStorage.setItem(CONSENT_KEY, 'yes'); setConsent('yes') }} style={{
        border: 0, borderRadius: 999, padding: '10px 16px', fontWeight: 800, cursor: 'pointer',
        background: '#ffd92f', color: '#172033',
      }}>Permitir análise</button>
      <button onClick={() => { localStorage.setItem(CONSENT_KEY, 'no'); setConsent('no') }} style={{
        border: '1px solid #475569', borderRadius: 999, padding: '10px 16px', fontWeight: 700, cursor: 'pointer',
        background: 'transparent', color: '#fff',
      }}>Só necessários</button>
      <a href="/privacidade" style={{ alignSelf: 'center', color: '#cbd5e1', fontSize: 13, marginLeft: 4 }}>Privacidade</a>
    </div>
  </div>
}
