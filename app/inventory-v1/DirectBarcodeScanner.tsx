'use client'

import { useEffect, useRef, useState } from 'react'
import { BarcodeDetector } from 'barcode-detector/ponyfill'
import { Check, X } from 'lucide-react'
import { evaluateDetection } from '@/lib/inventory/scannerPolicy'
import styles from './DirectBarcodeScanner.module.css'

type Props = {
  onCode: (code: string) => void
  close: () => void
}

const RETAIL_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] as const

function cameraError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Permita o acesso à câmera para escanear.'
    if (error.name === 'NotFoundError') return 'Nenhuma câmera foi encontrada.'
    if (error.name === 'NotReadableError') return 'A câmera está sendo usada por outro aplicativo.'
  }
  return 'Não foi possível abrir a câmera.'
}

export default function DirectBarcodeScanner({ onCode, close }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<BarcodeDetector | null>(null)
  const finishedRef = useRef(false)
  const onCodeRef = useRef(onCode)
  const [status, setStatus] = useState('Abrindo câmera…')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    onCodeRef.current = onCode
  }, [onCode])

  useEffect(() => {
    let disposed = false
    let scanTimer: number | undefined
    let messageTimer: number | undefined

    const stop = () => {
      if (scanTimer) window.clearTimeout(scanTimer)
      if (messageTimer) window.clearTimeout(messageTimer)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
    }

    const showRejected = () => {
      setStatus('Código visto, mas inválido — continue apontando')
      if (messageTimer) window.clearTimeout(messageTimer)
      messageTimer = window.setTimeout(() => {
        if (!disposed && !finishedRef.current) setStatus('Aponte para o código de barras')
      }, 700)
    }

    const scan = async () => {
      if (disposed || finishedRef.current) return
      const video = videoRef.current
      const detector = detectorRef.current

      if (!video || !detector || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        scanTimer = window.setTimeout(scan, 80)
        return
      }

      try {
        // Deliberadamente passa o frame de vídeo inteiro ao ZXing-C++.
        // A moldura da interface NÃO limita ROI, tamanho, cor ou posição do código.
        const results = await detector.detect(video)
        if (disposed || finishedRef.current) return

        for (const result of results) {
          const decision = evaluateDetection({
            rawValue: result.rawValue,
            format: result.format,
          })

          if (decision.kind === 'accept') {
            finishedRef.current = true
            setSuccess(true)
            setStatus(`Código lido: ${decision.code}`)
            navigator.vibrate?.(70)
            window.setTimeout(() => onCodeRef.current(decision.code), 120)
            return
          }

          if (decision.kind === 'reject') showRejected()
        }
      } catch {
        // Um frame sem barcode é um miss normal. Não muda UI nem interrompe o loop.
      }

      if (!disposed && !finishedRef.current) {
        scanTimer = window.setTimeout(scan, 90)
      }
    }

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('getUserMedia unavailable')
        }

        // IMPORTANTE: usamos explicitamente o ponyfill ZXing-C++/WASM.
        // Não usamos window.BarcodeDetector, API nativa ou qualquer shim legado.
        detectorRef.current = new BarcodeDetector({ formats: [...RETAIL_FORMATS] })

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (!video) throw new Error('video unavailable')
        video.srcObject = stream
        video.muted = true
        video.playsInline = true
        await video.play()

        const track = stream.getVideoTracks()[0]
        const capabilities: any = track?.getCapabilities?.() || {}
        if (capabilities.zoom) {
          const min = Number(capabilities.zoom.min ?? 1)
          const max = Number(capabilities.zoom.max ?? 1)
          const target = Math.min(max, Math.max(min, 1.4))
          try { await track.applyConstraints({ advanced: [{ zoom: target } as any] }) } catch {}
        }

        setStatus('Aponte para o código de barras')
        scan()
      } catch (error) {
        if (!disposed) setStatus(cameraError(error))
      }
    }

    start()
    return () => {
      disposed = true
      stop()
    }
  }, [])

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Leitor de código de barras">
      <div className={styles.scanner}>
        <video ref={videoRef} className={styles.video} autoPlay muted playsInline />
        <div className={styles.vignette} />
        <div className={styles.frame} aria-hidden="true">
          <i className={styles.line} />
        </div>

        <button className={styles.close} onClick={close} aria-label="Fechar scanner"><X /></button>

        <div className={success ? styles.successStatus : styles.status}>
          {success && <Check size={18} />}
          <span>{status}</span>
        </div>
      </div>
    </div>
  )
}
