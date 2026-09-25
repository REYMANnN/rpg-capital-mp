'use client'

import { useEffect, useRef, useState } from 'react'
import { BarcodeDetector } from 'barcode-detector/ponyfill'
import { evaluateDetection } from '@/lib/inventory/scannerPolicy'
import styles from './r.module.css'

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf', 'qr_code'] as const
const SAME_CODE_COOLDOWN_MS = 1800

type Props = {
  onCode: (code: string) => void
  paused?: boolean
  hint?: string
  compact?: boolean
}

function cameraError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Permita a câmera para ler os códigos.'
    if (error.name === 'NotFoundError') return 'Nenhuma câmera encontrada.'
    if (error.name === 'NotReadableError') return 'A câmera está em uso por outro app.'
  }
  return 'Não consegui abrir a câmera.'
}

// Câmera embutida na página que continua lendo: cada código novo chama onCode.
// O mesmo código só é aceito de novo depois de um intervalo curto (evita contar duas vezes).
export default function ContinuousScanner({ onCode, paused = false, hint = 'Aponte para o código de barras', compact = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onCodeRef = useRef(onCode)
  const pausedRef = useRef(paused)
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 })
  const [error, setError] = useState('')
  const [flash, setFlash] = useState(false)

  useEffect(() => { onCodeRef.current = onCode }, [onCode])
  useEffect(() => { pausedRef.current = paused }, [paused])

  useEffect(() => {
    let disposed = false
    let timer: number | undefined
    let stream: MediaStream | null = null
    let detector: BarcodeDetector | null = null

    const loop = async () => {
      if (disposed) return
      const video = videoRef.current
      if (!pausedRef.current && video && detector && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const results = await detector.detect(video)
          for (const result of results) {
            const decision = evaluateDetection({ rawValue: result.rawValue, format: result.format })
            if (decision.kind !== 'accept') continue
            const now = Date.now()
            if (decision.code === lastRef.current.code && now - lastRef.current.at < SAME_CODE_COOLDOWN_MS) {
              lastRef.current.at = now
              continue
            }
            lastRef.current = { code: decision.code, at: now }
            navigator.vibrate?.(60)
            setFlash(true)
            window.setTimeout(() => setFlash(false), 260)
            onCodeRef.current(decision.code)
            break
          }
        } catch {}
      }
      if (!disposed) timer = window.setTimeout(loop, 110)
    }

    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api')
        detector = new BarcodeDetector({ formats: [...FORMATS] })
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        if (disposed) { stream.getTracks().forEach((track) => track.stop()); return }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        video.muted = true
        video.playsInline = true
        await video.play()
        const track = stream.getVideoTracks()[0]
        const caps = (track?.getCapabilities?.() || {}) as { zoom?: { min?: number; max?: number } }
        if (caps.zoom) {
          const target = Math.min(Number(caps.zoom.max ?? 1), Math.max(Number(caps.zoom.min ?? 1), 1.4))
          try { await track.applyConstraints({ advanced: [{ zoom: target } as MediaTrackConstraintSet] }) } catch {}
        }
        loop()
      } catch (cause) {
        if (!disposed) setError(cameraError(cause))
      }
    })()

    return () => {
      disposed = true
      if (timer) window.clearTimeout(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  return (
    <div className={`${styles.camera} ${compact ? styles.cameraCompact : ''} ${flash ? styles.cameraFlash : ''}`}>
      <video ref={videoRef} className={styles.cameraVideo} autoPlay muted playsInline />
      <div className={styles.cameraFrame} aria-hidden="true"><i /></div>
      <div className={styles.cameraHint}>{error || (paused ? 'Pausado' : hint)}</div>
    </div>
  )
}
