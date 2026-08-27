'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Flashlight, Focus, Minus, Plus, ScanLine, X } from 'lucide-react'
import {
  countRecentConfirmations,
  isPlausibleRetailCode,
  normalizeBarcode,
  requiredConfirmations,
  runBarcodeQualitySelfTest,
  type BarcodeCandidate,
  type BarcodeSource,
} from '@/lib/inventory/barcodeQuality'
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
  if (name === 'OverconstrainedError') return 'A câmera recusou uma configuração avançada; tentando parâmetros compatíveis.'
  return error instanceof Error ? error.message : 'Não foi possível iniciar a câmera.'
}

function formatLabel(format?: string) {
  const value = String(format || '').toLowerCase()
  if (value.includes('ean13') || value.includes('ean_13')) return 'EAN-13'
  if (value.includes('ean8') || value.includes('ean_8')) return 'EAN-8'
  if (value.includes('upca') || value.includes('upc_a')) return 'UPC-A'
  if (value.includes('upce') || value.includes('upc_e')) return 'UPC-E'
  if (value.includes('code128') || value.includes('code_128')) return 'Code 128'
  return format || 'formato 1D'
}

export default function QuaggaScanner({ onCode, close }: Props) {
  const targetRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('Abrindo câmera traseira…')
  const [detail, setDetail] = useState('Preparando localização e decodificação de código de barras.')
  const [zoom, setZoom] = useState<ZoomRange | null>(null)
  const [torch, setTorch] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [focusAvailable, setFocusAvailable] = useState(false)
  const [frames, setFrames] = useState(0)
  const [located, setLocated] = useState(0)
  const [candidate, setCandidate] = useState('')
  const [candidateProgress, setCandidateProgress] = useState('')
  const [rejected, setRejected] = useState(0)
  const [engine, setEngine] = useState('Quagga2')
  const [manual, setManual] = useState('')
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')

  useEffect(() => {
    const selfTest = runBarcodeQualitySelfTest()
    if (!selfTest.ok) {
      setStatus('Falha no teste interno do validador')
      setDetail('O scanner não será confiado até o teste de checksum interno passar.')
      return
    }

    let disposed = false
    let Quagga: any
    let processedCount = 0
    let locatedCount = 0
    let rejectedCount = 0
    let lastLocatedAt = 0
    let startedAt = Date.now()
    let guidanceTimer: number | undefined
    let wasmTimer: number | undefined
    let wasmBusy = false
    let wasmReady = false
    let wasmCycles = 0
    const candidateHistory: BarcodeCandidate[] = []

    const acceptCandidate = (raw: string, source: BarcodeSource, format?: string) => {
      const code = normalizeBarcode(raw)
      if (!code || disposed) return

      if (!isPlausibleRetailCode(code, format)) {
        rejectedCount += 1
        setRejected(rejectedCount)
        setCandidate(code)
        setCandidateProgress('descartado')
        setStatus('Leitura descartada — código não passou validação')
        setDetail(`${source} sugeriu ${code} (${formatLabel(format)}), mas a leitura não passou as regras de integridade/checksum. Continue apontando; ela NÃO será enviada ao caixa.`)
        return
      }

      const now = Date.now()
      const item: BarcodeCandidate = { code, source, format, seenAt: now }
      candidateHistory.push(item)
      while (candidateHistory.length > 30 || (candidateHistory[0] && candidateHistory[0].seenAt < now - 3000)) candidateHistory.shift()

      const confirmations = countRecentConfirmations(candidateHistory, item)
      const needed = requiredConfirmations(code, source, format)
      setCandidate(code)
      setCandidateProgress(`${confirmations}/${needed}`)
      setStatus('Código plausível encontrado — confirmando')
      setDetail(`${source} leu ${code} como ${formatLabel(format)}. Confirmação ${confirmations} de ${needed}; mantendo a câmera parada evita falsos positivos.`)

      if (confirmations >= needed) {
        disposed = true
        setStatus('Código lido e validado')
        setCandidateProgress('confirmado')
        setDetail(`${code} foi confirmado ${confirmations} vezes e passou a validação. Enviando ao inventário/caixa.`)
        window.setTimeout(() => onCode(code), 100)
      }
    }

    const updateTrackControls = async () => {
      const track = Quagga?.CameraAccess?.getActiveTrack?.() as MediaStreamTrack | undefined
      if (!track) return
      const settings = track.getSettings?.() || {}
      const capabilities: any = track.getCapabilities?.() || {}

      const width = settings.width ? `${settings.width}×${settings.height || '?'}` : 'resolução automática'
      setStatus('Câmera pronta — procurando código')
      setDetail(`Imagem ${width}. Centralize as barras dentro da faixa; Quagga localiza e ZXing-C++ confirma.`)

      if (capabilities.zoom) {
        const current = Number((settings as any).zoom ?? capabilities.zoom.min ?? 1)
        setZoom({
          min: Number(capabilities.zoom.min),
          max: Number(capabilities.zoom.max),
          step: Number(capabilities.zoom.step || 0.1),
          value: current,
        })
      } else {
        setZoom(null)
      }

      setTorchAvailable(Boolean(capabilities.torch))
      setFocusAvailable(Boolean(capabilities.focusMode || capabilities.focusDistance))

      if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
        try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }) } catch {}
      }

      try {
        const videoInputs = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput')
        setCameras(videoInputs)
      } catch {}
    }

    const startWasmDecoder = async () => {
      if (disposed || wasmReady) return
      const video = targetRef.current?.querySelector('video') as HTMLVideoElement | null
      if (!video) return

      try {
        const { readBarcodes } = await import('zxing-wasm/reader')
        wasmReady = true
        setEngine('Quagga2 + ZXing-C++/WASM')
        setDetail('Motor C++/WebAssembly carregado. Ele fará leituras de alta precisão em paralelo ao localizador.')

        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('Canvas 2D indisponível')

        const scanFrame = async () => {
          if (disposed) return
          const currentVideo = targetRef.current?.querySelector('video') as HTMLVideoElement | null
          if (!currentVideo || currentVideo.readyState < 2 || currentVideo.videoWidth < 100 || wasmBusy) {
            wasmTimer = window.setTimeout(scanFrame, 180)
            return
          }

          wasmBusy = true
          wasmCycles += 1
          try {
            const vw = currentVideo.videoWidth
            const vh = currentVideo.videoHeight
            const fullFrame = wasmCycles % 4 === 0
            const sx = fullFrame ? 0 : Math.round(vw * 0.02)
            const sy = fullFrame ? 0 : Math.round(vh * 0.20)
            const sw = fullFrame ? vw : Math.round(vw * 0.96)
            const sh = fullFrame ? vh : Math.round(vh * 0.60)
            const maxWidth = 1600
            const scale = Math.min(1, maxWidth / sw)
            canvas.width = Math.max(320, Math.round(sw * scale))
            canvas.height = Math.max(180, Math.round(sh * scale))
            context.drawImage(currentVideo, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height)

            const results: any[] = await readBarcodes(imageData, {
              tryHarder: true,
              formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128'],
              maxNumberOfSymbols: 3,
            } as any)

            if (results.length) {
              for (const result of results) {
                acceptCandidate(result.text || result.bytes?.toString?.() || '', 'ZXing-C++/WASM', result.format)
              }
            } else if (lastLocatedAt && Date.now() - lastLocatedAt < 1000) {
              setStatus('Barras localizadas — decoder C++ tentando')
              setDetail('A região do código foi encontrada. O decoder de alta precisão ainda não fechou uma leitura válida; mantenha a embalagem estável e nítida.')
            }
          } catch (error) {
            if (!disposed) setDetail(`Decoder C++/WASM encontrou um problema neste frame (${friendlyCameraError(error)}). O scanner continua nos próximos frames.`)
          } finally {
            wasmBusy = false
            if (!disposed) wasmTimer = window.setTimeout(scanFrame, 220)
          }
        }

        scanFrame()
      } catch (error) {
        if (!disposed) {
          setEngine('Quagga2')
          setDetail(`ZXing-C++/WASM não carregou (${friendlyCameraError(error)}). Quagga2 continua ativo, mas a leitura pode ser menos robusta.`)
        }
      }
    }

    const initQuagga = async (advanced: boolean) => {
      if (!targetRef.current) throw new Error('Área da câmera indisponível')
      const deviceConstraint = selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : { facingMode: { ideal: 'environment' } }
      const constraints = advanced
        ? {
            ...deviceConstraint,
            width: { ideal: 1920, min: 960 },
            height: { ideal: 1080, min: 540 },
            focusMode: 'continuous',
          }
        : {
            ...deviceConstraint,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          }

      await new Promise<void>((resolve, reject) => {
        Quagga.init(
          {
            inputStream: {
              name: 'RPG retail barcode camera',
              type: 'LiveStream',
              target: targetRef.current,
              size: 1280,
              constraints: constraints as any,
              area: { top: '22%', right: '2%', left: '2%', bottom: '22%' },
            },
            frequency: 10,
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
              setStatus('Barras localizadas — tentando decodificar')
              setDetail('As barras estão visíveis. O sistema está tentando transformar o padrão em um EAN/UPC válido; mantenha o produto parado.')
            }
          }

          if (result?.codeResult?.code) {
            acceptCandidate(result.codeResult.code, 'Quagga2', result.codeResult.format)
          }
        }

        const onDetected = (result: any) => {
          if (result?.codeResult?.code) acceptCandidate(result.codeResult.code, 'Quagga2', result.codeResult.format)
        }

        Quagga.onProcessed(onProcessed)
        Quagga.onDetected(onDetected)

        try {
          await initQuagga(true)
        } catch {
          setStatus('Câmera aceitou apenas modo compatível')
          setDetail('Configuração avançada de foco/resolução foi recusada; reiniciando sem exigir esses controles.')
          await initQuagga(false)
        }

        if (disposed) return
        Quagga.start()
        startedAt = Date.now()
        await updateTrackControls()
        window.setTimeout(startWasmDecoder, 350)

        guidanceTimer = window.setInterval(() => {
          if (disposed) return
          const elapsed = Date.now() - startedAt
          const sinceLocation = Date.now() - lastLocatedAt
          if (elapsed > 8000 && (!lastLocatedAt || sinceLocation > 3000)) {
            setStatus('Ainda não encontrei uma região de barras estável')
            setDetail('Aproxime até o código ocupar cerca de metade da largura da tela. Se ficar borrado, afaste um pouco e use o zoom. Evite reflexos sobre as barras.')
          } else if (elapsed > 5000 && lastLocatedAt && sinceLocation < 2500 && !candidate) {
            setStatus('Barras vistas, mas nenhum código válido ainda')
            setDetail('A câmera está vendo o padrão. Ajuste ligeiramente distância/zoom para deixar as bordas das barras nítidas; o decoder C++ continua tentando.')
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
      if (wasmTimer) window.clearTimeout(wasmTimer)
      try { Quagga?.stop?.() } catch {}
      try { Quagga?.CameraAccess?.release?.() } catch {}
    }
  }, [onCode, selectedDeviceId])

  const applyZoom = async (value: number) => {
    setZoom((current) => (current ? { ...current, value } : current))
    try {
      const imported: any = await import('@ericblade/quagga2')
      const Quagga = imported.default || imported
      const track = Quagga.CameraAccess?.getActiveTrack?.() as MediaStreamTrack | undefined
      await track?.applyConstraints?.({ advanced: [{ zoom: value } as any] })
      setDetail(`Zoom ajustado para ${value.toFixed(1)}×. Pare quando as bordas das barras ficarem mais nítidas.`)
    } catch {
      setDetail('A câmera anunciou suporte a zoom, mas recusou este ajuste.')
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
        setDetail('Foco contínuo reaplicado. Mova a embalagem alguns centímetros e pare quando as barras estiverem nítidas.')
      } else {
        setDetail('Este navegador não expõe controle direto de foco. Afaste alguns centímetros e ajuste o zoom.')
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
            <span>Barras: {located}</span>
            <span>Descartadas: {rejected}</span>
            {candidate && <span className={styles.candidate}>Candidato: {candidate} {candidateProgress && `· ${candidateProgress}`}</span>}
          </div>
        </div>

        <div className={styles.controls}>
          {cameras.length > 1 && (
            <label>
              <span>Câmera</span>
              <select value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)}>
                <option value="">Traseira automática</option>
                {cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Câmera ${index + 1}`}</option>)}
              </select>
            </label>
          )}

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
