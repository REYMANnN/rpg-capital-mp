'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { evaluateDetection } from '@/lib/inventory/scannerPolicy'
import styles from './DirectBarcodeScanner.module.css'

type Props = {
  onCode: (code: string) => void
  close: () => void
}

const RETAIL_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']

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
  const detectorRef = useRef<any>(null)
  const finishedRef = useRef(false)
  const [status, setStatus] = useState('Abrindo câmera…')
  const [success, setSuccess] = useState(false)

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

      if (!video || !detector || video.readyState < 2) {
        scanTimer = window.setTimeout(scan, 80)
        return
      }

      try {
        const results = await detector.detect(video)
        if (disposed || finishedRef.current) return

        if (Array.isArray(results) && results.length > 0) {
          for (const result of results) {
            const decision = evaluateDetection({
              rawValue: result?.rawValue,
              format: result?.format,
            })

            if (decision.kind === 'accept') {
              finishedRef.current = true
              setSuccess(true)
              setStatus(`Código lido: ${decision.code}`)
              navigator.vibrate?.(70)
              window.setTimeout(() => onCode(decision.code), 120)
              return
            }

            if (decision.kind === 'reject') showRejected()
          }
        }
      } catch {
        // Igual ao scanner PWA de referência: uma tentativa sem código não é erro.
        // Continuamos escaneando silenciosamente.
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

        // Mesmo padrão do georapbox: usa a API nativa quando existe e instala
        // o polyfill barcode-detector quando o navegador (ex.: Safari/iPhone) não oferece.
        if (!('BarcodeDetector' in window)) {
          await import('barcode-detector')
        }
        if (disposed) return

        const Detector = (window as any).BarcodeDetector
        if (!Detector) throw new Error('BarcodeDetector unavailable')

        const supported: string[] = typeof Detector.getSupportedFormats === 'function'
          ? await Detector.getSupportedFormats()
          : RETAIL_FORMATS
        const formats = RETAIL_FORMATS.filter((format) => supported.includes(format))
        detectorRef.current = new Detector({ formats: formats.length ? formats : RETAIL_FORMATS })

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

        // Sem controle na interface: se a câmera expõe zoom, usamos um leve zoom
        // automaticamente para favorecer EAN de embalagem sem obrigar o usuário a ajustar nada.
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
  }, [onCode])

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
