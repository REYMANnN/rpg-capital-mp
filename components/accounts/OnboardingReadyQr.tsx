'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export default function OnboardingReadyQr({ href }: { href: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    void QRCode.toDataURL(href, { width: 220, margin: 1 }).then(setSrc).catch(() => setSrc(''))
  }, [href])
  if (!src) return null
  return <div className="hidden md:block">
    <p className="mb-3 text-sm font-semibold text-slate-600">Ou aponte a câmera do celular:</p>
    <img src={src} alt="QR code para falar com a Rafa no WhatsApp" width={220} height={220} className="rounded-2xl border border-slate-200 bg-white p-2" />
  </div>
}
