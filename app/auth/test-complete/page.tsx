'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function TemporaryTestCompletePage() {
  const [message, setMessage] = useState('Entrando na conta de teste…')

  useEffect(() => {
    let cancelled = false

    async function complete() {
      const params = new URLSearchParams(window.location.hash.slice(1))
      const access_token = params.get('access_token')
      const refresh_token = params.get('refresh_token')

      if (!access_token || !refresh_token) {
        if (!cancelled) setMessage('O link temporário expirou ou é inválido.')
        return
      }

      const supabase = createClient()
      const { error } = await supabase.auth.setSession({ access_token, refresh_token })
      if (error) {
        if (!cancelled) setMessage('Não conseguimos abrir a sessão temporária.')
        return
      }

      window.history.replaceState(null, '', window.location.pathname)
      window.location.replace('/manage')
    }

    void complete()
    return () => { cancelled = true }
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-950">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold tracking-[0.16em] text-blue-700">BALCÃO</p>
        <p className="mt-4 text-base font-semibold">{message}</p>
      </div>
    </main>
  )
}
