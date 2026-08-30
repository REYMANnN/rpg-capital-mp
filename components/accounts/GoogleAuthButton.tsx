'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const GOOGLE_CLIENT_ID = '666055406236-8t67dl1jrp95pk3gvhpgp3f1d0ig9a5j.apps.googleusercontent.com'
const GOOGLE_GSI_SRC = 'https://accounts.google.com/gsi/client'

type GoogleCredentialResponse = { credential?: string }
type GoogleIdApi = {
  initialize: (options: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
    nonce?: string
    use_fedcm_for_prompt?: boolean
  }) => void
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } }
  }
}

function createNonce() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export default function GoogleAuthButton({
  label = 'Continuar com Google',
  intent,
}: {
  label?: string
  intent: 'login' | 'signup'
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const nonceRef = useRef<string>('')
  const initializedRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function initializeGoogle() {
      if (cancelled || initializedRef.current || !window.google?.accounts?.id || !containerRef.current) return

      const nonce = createNonce()
      const hashedNonce = await sha256(nonce)
      if (cancelled || !containerRef.current || !window.google?.accounts?.id) return

      nonceRef.current = nonce
      initializedRef.current = true
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        nonce: hashedNonce,
        use_fedcm_for_prompt: true,
        callback: async ({ credential }) => {
          if (!credential) {
            setError('O Google não devolveu uma identificação válida. Tente novamente.')
            return
          }

          setBusy(true)
          setError('')
          const supabase = createClient()
          const { error: authError } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: credential,
            nonce: nonceRef.current,
          })

          if (authError) {
            setError('Não conseguimos concluir seu login com Google. Tente novamente.')
            setBusy(false)
            return
          }

          window.location.assign(`/auth/google/complete?intent=${intent}`)
        },
      })

      containerRef.current.innerHTML = ''
      window.google.accounts.id.renderButton(containerRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: intent === 'signup' ? 'signup_with' : 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 360,
      })
      setLoaded(true)
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_GSI_SRC}"]`)
    if (existing) {
      if (window.google?.accounts?.id) void initializeGoogle()
      else existing.addEventListener('load', initializeGoogle, { once: true })
    } else {
      const script = document.createElement('script')
      script.src = GOOGLE_GSI_SRC
      script.async = true
      script.defer = true
      script.addEventListener('load', initializeGoogle, { once: true })
      script.addEventListener('error', () => {
        if (!cancelled) setError('Não conseguimos carregar o login do Google. Verifique sua conexão e tente novamente.')
      }, { once: true })
      document.head.appendChild(script)
    }

    return () => {
      cancelled = true
    }
  }, [intent])

  return (
    <div className="w-full">
      <div className="relative flex min-h-12 w-full items-center justify-center" aria-busy={busy || !loaded}>
        {!loaded ? <span className="text-sm font-medium text-slate-600">Carregando Google…</span> : null}
        <div ref={containerRef} className={busy ? 'pointer-events-none opacity-60' : ''} />
      </div>
      {busy ? <p className="mt-3 text-center text-sm font-medium text-slate-600">{intent === 'signup' ? 'Criando sua conta…' : 'Entrando no BALCÃO…'}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
    </div>
  )
}
