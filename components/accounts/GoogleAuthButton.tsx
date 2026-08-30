'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const BALCAO_APP_URL = 'https://rpg-capital-mp-25zw.vercel.app'

export default function GoogleAuthButton({ label = 'Continuar com Google' }: { label?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function continueWithGoogle() {
    setBusy(true)
    setError('')
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${BALCAO_APP_URL}/auth/google/callback`,
      },
    })

    if (authError) {
      setError('Não conseguimos abrir o Google. Tente novamente.')
      setBusy(false)
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={continueWithGoogle}
        disabled={busy}
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-60"
      >
        <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full border border-slate-200 font-bold">G</span>
        {busy ? 'Abrindo Google…' : label}
      </button>
      {error ? <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
    </div>
  )
}
