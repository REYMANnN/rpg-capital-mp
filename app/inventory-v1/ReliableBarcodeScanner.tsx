'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Image as ImageIcon, ScanLine, X } from 'lucide-react'
import { hasValidGtinChecksum, normalizeBarcode } from '@/lib/inventory/barcodeQuality'
import styles from './ReliableBarcodeScanner.module.css'

type Props = {
  onCode: (code: string) => void
  close: () => void
}

function formatName(decodedResult: any) {
  return String(
    decodedResult?.result?.format?.formatName
      ?? decodedResult?.result?.format?.toString?.()
      ?? decodedResult?.decodedResult?.format
      ?? '',
  ).toUpperCase()
}

function isStrongRetailRead(code: string, format: string) {
  if (/^\d{8}$/.test(code) && format.includes('UPC_E')) return true
  if (/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(code)) return hasValidGtinChecksum(code)
  return false
}

export default function ReliableBarcodeScanner({ onCode, close }: Props) {
  const readerId = useRef(`rpg-reader-${Math.random().toString(36).slice(2)}`)
  const scannerRef = useRef<any>(null)
  const seenRef = useRef<{ code: string; at: number; hits: number }>({ code: '', at: 0, hits: 0 })
  const finishedRef = useRef(false)
  const [status, setStatus] = useState('Preparando leitor de varejo…')
  const [detail, setDetail] = useState('A câmera será controlada pelo html5-qrcode, sem o localizador ruidoso do scanner anterior.')
  const [reads, setReads] = useState(0)
  const [rejected, setRejected] = useState(0)
  const [lastCandidate, setLastCandidate] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)

  const acceptDecoded = (raw: string, decodedResult?: any, source = 'html5-qrcode') => {
    if (finishedRef.current) return
    const code = normalizeBarcode(raw)
    const format = formatName(decodedResult)
    if (!code || code.length < 6) return

    setReads((n) => n + 1)
    setLastCandidate(code)

    // EAN/UPC de varejo só entra se o dígito verificador estiver correto.
    if (/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(code) && !isStrongRetailRead(code, format)) {
      setRejected((n) => n + 1)
      setStatus('Leitura descartada')
      setDetail(`${source} produziu ${code}, mas o dígito verificador não confere. O produto NÃO foi aceito.`)
      return
    }

    // Um EAN/UPC com checksum válido já foi validado pelo decoder e por nós.
    if (isStrongRetailRead(code, format)) {
      finishedRef.current = true
      setStatus('Código lido e validado')
      setDetail(`${code} reconhecido como ${format || 'EAN/UPC'} válido.`)
      navigator.vibrate?.(80)
      window.setTimeout(() => onCode(code), 100)
      return
    }

    // Code 128 e formatos sem checksum GS1 exigem repetição real em callbacks separados.
    const now = Date.now()
    const previous = seenRef.current
    if (previous.code === code && now - previous.at < 1800) {
      previous.hits += 1
      previous.at = now
    } else {
      seenRef.current = { code, at: now, hits: 1 }
    }

    const hits = seenRef.current.hits
    setStatus('Código candidato — confirmando')
    setDetail(`${source} leu ${code}. Confirmação ${hits}/2 para evitar falso positivo.`)
    if (hits >= 2) {
      finishedRef.current = true
      setStatus('Código confirmado')
      navigator.vibrate?.(80)
      window.setTimeout(() => onCode(code), 100)
    }
  }

  useEffect(() => {
    let disposed = false
    let quietTimer: number | undefined

    async function start() {
      try {
        const mod: any = await import('html5-qrcode')
        if (disposed) return
        const { Html5QrcodeScanner, Html5QrcodeSupportedFormats, Html5QrcodeScanType } = mod

        const scanner = new Html5QrcodeScanner(
          readerId.current,
          {
            fps: 15,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => ({
              width: Math.max(260, Math.floor(viewfinderWidth * 0.92)),
              height: Math.max(110, Math.min(190, Math.floor(viewfinderHeight * 0.32))),
            }),
            aspectRatio: 16 / 9,
            rememberLastUsedCamera: true,
            showTorchButtonIfSupported: true,
            showZoomSliderIfSupported: true,
            defaultZoomValueIfSupported: 2,
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
            formatsToSupport: [
              Html5QrcodeSupportedFormats.EAN_13,
              Html5QrcodeSupportedFormats.EAN_8,
              Html5QrcodeSupportedFormats.UPC_A,
              Html5QrcodeSupportedFormats.UPC_E,
              Html5QrcodeSupportedFormats.CODE_128,
            ],
          } as any,
          false,
        )
        scannerRef.current = scanner

        scanner.render(
          (decodedText: string, decodedResult: any) => acceptDecoded(decodedText, decodedResult, 'html5-qrcode/ZXing'),
          () => {
            if (disposed || finishedRef.current) return
            setStatus((current) => current.includes('descartada') ? current : 'Câmera ativa — procurando um código válido')
          },
        )

        setStatus('Câmera ativa — procurando um código válido')
        setDetail('Aproxime o EAN até ocupar boa parte da moldura. A própria câmera do aparelho controla o autofocus.')

        quietTimer = window.setInterval(() => {
          if (disposed || finishedRef.current) return
          setDetail((current) => current.includes('dígito verificador')
            ? current
            : 'Nenhum código válido foi fechado ainda. Mantenha as barras inteiras, com contraste e sem reflexo. Zoom e lanterna aparecem no leitor quando o aparelho suporta.')
        }, 4500)
      } catch (error) {
        setStatus('Falha ao iniciar o leitor')
        setDetail(error instanceof Error ? error.message : String(error))
      }
    }

    start()
    return () => {
      disposed = true
      if (quietTimer) window.clearInterval(quietTimer)
      const scanner = scannerRef.current
      scannerRef.current = null
      try { scanner?.clear?.().catch?.(() => {}) } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const decodePhoto = async (file: File) => {
    if (!file || finishedRef.current) return
    setPhotoBusy(true)
    setStatus('Analisando foto em alta qualidade…')
    setDetail('Usando ZXing-C++/WebAssembly com modo tryHarder.')
    try {
      const { readBarcodes } = await import('zxing-wasm/reader')
      const results: any[] = await readBarcodes(file, {
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        maxNumberOfSymbols: 4,
        formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128'],
      } as any)
      if (!results.length) {
        setStatus('Foto analisada — nenhum código encontrado')
        setDetail('A foto foi processada pelo decoder C++ completo, mas nenhum EAN/UPC/Code128 foi reconhecido.')
        return
      }
      const result = results[0]
      acceptDecoded(result.text, { result: { format: { formatName: result.format } } }, 'ZXing-C++/WASM')
    } catch (error) {
      setStatus('Falha ao analisar a foto')
      setDetail(error instanceof Error ? error.message : String(error))
    } finally {
      setPhotoBusy(false)
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Scanner de código de barras">
      <section className={styles.panel}>
        <header className={styles.header}>
          <div>
            <span><ScanLine size={17} /> Leitor de código de barras</span>
            <h2>EAN / UPC / Code 128</h2>
          </div>
          <button onClick={close} aria-label="Fechar"><X /></button>
        </header>

        <div id={readerId.current} className={styles.reader} />

        <div className={styles.status}>
          <strong>{status}</strong>
          <p>{detail}</p>
          <div className={styles.metrics}>
            <span>Leituras do decoder: {reads}</span>
            <span>Descartadas: {rejected}</span>
            {lastCandidate && <span>Último candidato: {lastCandidate}</span>}
          </div>
        </div>

        <div className={styles.photoFallback}>
          <ImageIcon size={20} />
          <div>
            <strong>Teste por foto</strong>
            <small>Se quiser diagnosticar a óptica, tire uma foto nítida do mesmo código e o C++ analisa a imagem inteira.</small>
          </div>
          <label>
            <Camera size={18} /> {photoBusy ? 'Analisando…' : 'Tirar foto'}
            <input
              hidden
              type="file"
              accept="image/*"
              capture="environment"
              disabled={photoBusy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) decodePhoto(file)
                event.currentTarget.value = ''
              }}
            />
          </label>
        </div>

        <p className={styles.note}>Não existe botão de “refocar” nesta versão: em iPhone o navegador normalmente não expõe controle manual de foco. O leitor usa o autofocus real da câmera e só mostra zoom/lanterna quando o hardware entrega esses controles.</p>
      </section>
    </div>
  )
}
