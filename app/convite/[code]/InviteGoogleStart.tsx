'use client'

import { useEffect, useState } from 'react'
import GoogleAuthButton from '@/components/accounts/GoogleAuthButton'
import { openInvite } from './actions'

export default function InviteGoogleStart({ code }: { code: string }) {
  const [ready, setReady] = useState(false)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    let active = true
    void openInvite(code).then((result) => {
      if (!active) return
      if (result.ok) setReady(true)
      else setInvalid(true)
    }).catch(() => { if (active) setInvalid(true) })
    return () => { active = false }
  }, [code])

  if (invalid) return <p className="rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">Esse convite não vale mais. Fala com quem te mandou.</p>
  if (!ready) return <p className="text-sm font-medium text-slate-500">Preparando seu acesso…</p>
  return <GoogleAuthButton intent="signup" label="Criar conta com Google" />
}
