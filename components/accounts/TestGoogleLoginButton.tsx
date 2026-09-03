'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const TEST_EMAIL = 'renanguadalupe05@gmail.com'

export default function TestGoogleLoginButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function login() {
    setBusy(true)
    setError('')

    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/google/callback?next=/manage`
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          login_hint: TEST_EMAIL,
          prompt: 'select_account',
        },
      },
    })

    if (authError) {
      setError('Não foi possível abrir o acesso de teste.')
      setBusy(false)
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={login}
        disabled={busy}
        className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-950 hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? 'Abrindo conta de teste…' : 'Entrar na conta de teste'}
      </button>
      <p className="mt-2 text-center text-xs text-slate-500">Temporário · {TEST_EMAIL}</p>
      {error ? <p role="alert" className="mt-2 text-center text-sm font-medium text-red-700">{error}</p> : null}
    </div>
  )
}
