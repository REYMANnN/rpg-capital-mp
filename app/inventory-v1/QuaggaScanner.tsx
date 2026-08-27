'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Flashlight, Focus, Minus, Plus, ScanLine, X } from 'lucide-react'
import styles from './QuaggaScanner.module.css'

type ZoomRange = { min: number; max: number; step: number; value: number }

type Props = {
  onCode: (code: string) => void
  close: () => void
}

function friendlyCameraError(error: unknown) {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError') return 'Permissão da câmera negada. Libere a câmera nas permissões do navegador e tente novamente.'
  if (name === 'NotFoundError') return 'Nenhuma câmera compatível foi encontrada.'
  if (name === 'NotReadableError') return 'A câmera está ocupada por outro aplicativo ou não pôde ser iniciada.'
  if (name === 'OverconstrainedError') return 'A câmera não aceitou as configurações solicitadas. Vou tentar uma configuração mais simples.'
  return error instanceof Error ? error.message : 'Não foi possível iniciar a câmera.'
}

export default function QuaggaScanner({ onCode, close }: Props) {
  const targetRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('Abrindo câmera traseira…')
  const [detail, setDetail] = useState('Preparando detector de código de barras.')
  const [zoom, setZoom] = useState<ZoomRange | null>(null)
  const [torch, setTorch] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [focusAvailable, setFocusAvailable] = useState(false)
  const [frames, setFrames] = useState(0)
  const [located, setLocated] = useState(0)
  const [candidate, setCandidate] = useState('')
  const [engine, setEngine] = useState('Quagga2')
  const [manual, setManual] = useState('')

  useEffect(() => {
    let disposed = false
    let Quagga: any
    let zxingControls: any
    let zxingReader: any
    let processedCount = 0
    let locatedCount = 0
    let lastLocatedAt = 0
    let startedAt = Date.now()
    let lastCandidate = ''
    let candidateHits = 0
    let fallbackStarted = false
    let guidanceTimer: number | undefined

    const accept = (raw: string, source: string) => {
      const code = String(raw || '').replace(/\s+/g, '').trim()
      if (!code || disposed) return
      if (code.length < 6) {
        setStatus('Código localizado, mas leitura incompleta')
        setDetail(`O detector encontrou “${code}”, mas ele é curto demais. Continue apontando a câmera.`)
        return
      }

      if (lastCandidate === code) candidateHits += 1
      else {
        lastCandidate = code
        candidateHits = 1
      }
      setCandidate(code)
      setStatus('Código encontrado — confirmando…')
      setDetail(`${source} leu ${code}. Confirmando a mesma leitura para evitar falso positivo.`)

      // EAN/UPC têm checksum no próprio decoder. Para qualquer formato, duas leituras iguais
      // tornam o uso em checkout muito mais seguro sem deixar a leitura perceptivelmente lenta.
      if (candidateHits >= 2) {
        disposed = true
        setStatus('Código lido')
        setDetail(`${code} reconhecido com sucesso por ${source}.`)
        window.setTimeout(() => onCode(code), 120)
      }
    }

    const updateTrackControls = async () => {
      const track = Quagga?.CameraAccess?.getActiveTrack?.() as MediaStreamTrack | undefined
      if (!track) return
      const settings = track.getSettings?.() || {}
      const capabilities: any = track.getCapabilities?.() || {}

      const width = settings.width ? `${settings.width}×${settings.height || '?'}` : 'resolução automática'
      setStatus('Câmera pronta — procurando código')
      setDetail(`Imagem ${width}. Centralize todas as barras dentro da faixa verde.`)

      if (capabilities.zoom) {
        const current = Number((settings as any).zoom ?? capabilities.zoom.min ?? 1)
        setZoom({
          min: Number(capabilities.zoom.min),
          max: Number(capabilities.zoom.max),
          step: Number(capabilities.zoom.step || 0.1),
          value: current,
        })
      }
      setTorchAvailable(Boolean(capabilities.torch))
      setFocusAvailable(Boolean(capabilities.focusMode || capabilities.focusDistance))

      if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
        try {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] })
        } catch {}
      }
    }

    const startZXingFallback = async () => {
      if (fallbackStarted || disposed || !targetRef.current) return
      const video = targetRef.current.querySelector('video') as HTMLVideoElement | null
      if (!video) return
      fallbackStarted = true
      setEngine('Quagga2 + ZXing')
      setDetail('Quagga2 continua localizando; ZXing entrou como segundo decoder sobre a mesma câmera.')
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        zxingReader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 120,
          delayBetweenScanSuccess: 200,
        })
        zxingControls = await zxingReader.decodeFromVideoElement(video, (result: any) => {
          if (result?.getText) accept(result.getText(), 'ZXing')
        })
      } catch (error) {
        if (!disposed) setDetail(`Segundo decoder não iniciou: ${friendlyCameraError(error)} Quagga2 continua ativo.`)
      }
    }

    const start = async () => {
      try {
        const imported: any = await import('@ericblade/quagga2')
        Quagga = imported.default || imported
        if (!targetRef.current || disposed) return

        const onProcessed = (result: any) => {
          if (disposed) return
          processedCount += 1
          if (processedCount % 5 === 0) setFrames(processedCount)
          const boxes = result?.boxes?.filter((box: any) => box) || []
          if (boxes.length) {
            locatedCount += 1
            lastLocatedAt = Date.now()
            if (locatedCount % 2 === 0) setLocated(locatedCount)
            if (!result?.codeResult?.code) {
              setStatus('Código localizado — tentando decodificar')
              setDetail('As barras foram encontradas. Mantenha a embalagem parada por um instante.')
            }
          }
          if (result?.codeResult?.code) accept(result.codeResult.code, 'Quagga2')
        }

        const onDetected = (result: any) => {
          if (result?.codeResult?.code) accept(result.codeResult.code, 'Quagga2')
        }

        Quagga.onProcessed(onProcessed)
        Quagga.onDetected(onDetected)

        await new Promise<void>((resolve, reject) => {
          Quagga.init(
            {
              inputStream: {
                name: 'RPG barcode camera',
                type: 'LiveStream',
                target: targetRef.current,
                size: 1280,
                constraints: {
                  facingMode: { ideal: 'environment' },
                  width: { ideal: 1920, min: 960 },
                  height: { ideal: 1080, min: 540 },
                  aspectRatio: { ideal: 16 / 9 },
                  focusMode: 'continuous',
                } as any,
                area: { top: '27%', right: '4%', left: '4%', bottom: '27%' },
              },
              frequency: 15,
              locate: true,
              locator: {
                halfSample: true,
                patchSize: 'medium',
              },
              decoder: {
                readers: ['ean_reader', 'ean_8_reader', 'upc_reader', 'upc_e_reader', 'code_128_reader'],
                multiple: false,
              },
              numOfWorkers: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)),
            } as any,
            (error: unknown) => (error ? reject(error) : resolve()),
          )
        })

        if (disposed) return
        Quagga.start()
        startedAt = Date.now()
        await updateTrackControls()

        // Se o primeiro motor não decodificar rápido, entra um segundo decoder maduro
        // usando a MESMA câmera, sem nova permissão e sem trocar a imagem do usuário.
        window.setTimeout(startZXingFallback, 3200)

        guidanceTimer = window.setInterval(() => {
          if (disposed) return
          const elapsed = Date.now() - startedAt
          if (elapsed > 8500 && Date.now() - lastLocatedAt > 2500) {
            setStatus('Ainda procurando as barras')
            setDetail('Aproxime o código até ocupar boa parte da faixa verde. Evite reflexo e deixe as barras inteiras visíveis.')
          } else if (elapsed > 6000 && lastLocatedAt) {
            setStatus('Barras vistas, mas código ainda não fechado')
            setDetail('O sistema está enxergando o código. Ajuste o zoom ou afaste alguns centímetros para melhorar o foco.')
          }
        }, 1200)
      } catch (error) {
        if (disposed) return
        setStatus('Câmera não iniciou')
        setDetail(friendlyCameraError(error))
      }
    }

    start()

    return () => {
      disposed = true
      if (guidanceTimer) window.clearInterval(guidanceTimer)
      try { zxingControls?.stop?.() } catch {}
      try { zxingReader?.reset?.() } catch {}
      try { Quagga?.stop?.() } catch {}
      try { Quagga?.CameraAccess?.release?.() } catch {}
    }
  }, [onCode])

  const applyZoom = async (value: number) => {
    setZoom((current) => (current ? { ...current, value } : current))
    try {
      const imported: any = await import('@ericblade/quagga2')
      const Quagga = imported.default || imported
      const track = Quagga.CameraAccess?.getActiveTrack?.() as MediaStreamTrack | undefined
      await track?.applyConstraints?.({ advanced: [{ zoom: value } as any] })
      setDetail(`Zoom ajustado para ${value.toFixed(1)}×. Mantenha as barras nítidas dentro da faixa.`)
    } catch {
      setDetail('Este navegador mostrou controle de zoom, mas a câmera recusou o ajuste.')
    }
  }

  const refocus = async () => {
    try {
      const imported: any = await import('@ericblade/quagga2')
      const Quagga = imported.default || imported
      const track = Quagga.CameraAccess?.getActiveTrack?.() as MediaStreamTrack | undefined
      const caps: any = track?.getCapabilities?.() || {}
      if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
        await track?.applyConstraints?.({ advanced: [{ focusMode: 'continuous' } as any] })
        setDetail('Foco contínuo reaplicado. Mova o produto levemente para a câmera refocar.')
      } else {
        setDetail('Esta câmera não expõe controle de foco ao navegador. Use o zoom ou afaste alguns centímetros.')
      }
    } catch {
      setDetail('O navegador não permitiu controlar o foco desta câmera.')
    }
  }

  const toggleTorch = async () => {
    try {
      const imported: any = await import('@ericblade/quagga2')
      const Quagga = imported.default || imported
      if (torch) await Quagga.CameraAccess.disableTorch()
      else await Quagga.CameraAccess.enableTorch()
      setTorch(!torch)
    } catch {
      setDetail('A lanterna não pôde ser alterada neste aparelho/navegador.')
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Leitor de código de barras">
      <section className={styles.panel}>
        <header className={styles.header}>
          <div>
            <span className={styles.kicker}><ScanLine size={16} /> Scanner de varejo</span>
            <h2>Enquadre o código de barras</h2>
          </div>
          <button className={styles.close} onClick={close} aria-label="Fechar scanner"><X /></button>
        </header>

        <div className={styles.cameraStage}>
          <div ref={targetRef} className={styles.quaggaTarget} />
          <div className={styles.shadeTop} />
          <div className={styles.shadeBottom} />
          <div className={styles.scanFrame}>
            <i />
            <span>mantenha todas as barras dentro desta faixa</span>
          </div>
        </div>

        <div className={styles.statusCard}>
          <div className={styles.statusRow}>
            <span className={styles.pulse} />
            <div>
              <strong>{status}</strong>
              <p>{detail}</p>
            </div>
          </div>
          <div className={styles.telemetry}>
            <span>Motor: {engine}</span>
            <span>Frames: {frames}</span>
            <span>Barras localizadas: {located}</span>
            {candidate && <span className={styles.candidate}>Candidato: {candidate}</span>}
          </div>
        </div>

        <div className={styles.controls}>
          {zoom ? (
            <div className={styles.zoomControl}>
              <button onClick={() => applyZoom(Math.max(zoom.min, zoom.value - Math.max(zoom.step, 0.2)))} aria-label="Diminuir zoom"><Minus /></button>
              <label>
                <span>Zoom {zoom.value.toFixed(1)}×</span>
                <input
                  type="range"
                  min={zoom.min}
                  max={zoom.max}
                  step={zoom.step}
                  value={zoom.value}
                  onChange={(event) => applyZoom(Number(event.target.value))}
                />
              </label>
              <button onClick={() => applyZoom(Math.min(zoom.max, zoom.value + Math.max(zoom.step, 0.2)))} aria-label="Aumentar zoom"><Plus /></button>
            </div>
          ) : <span className={styles.noControl}>Zoom óptico não exposto por esta câmera</span>}

          <div className={styles.quickControls}>
            <button onClick={refocus} disabled={!focusAvailable}><Focus /> Refocar</button>
            <button onClick={toggleTorch} disabled={!torchAvailable}><Flashlight /> {torch ? 'Apagar luz' : 'Lanterna'}</button>
          </div>
        </div>

        <div className={styles.manualFallback}>
          <Camera size={18} />
          <input
            inputMode="numeric"
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && manual.trim()) onCode(manual.trim()) }}
            placeholder="Leitor USB / código manual (reserva)"
          />
          <button onClick={() => manual.trim() && onCode(manual.trim())}>Usar</button>
        </div>
      </section>
    </div>
  )
}
