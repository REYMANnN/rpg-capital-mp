'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import styles from './site.module.css'

/** Liga uma vez quando o elemento entra na tela (ou na hora, se o navegador não tiver IntersectionObserver). */
function useInView<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      const id = requestAnimationFrame(() => setInView(true))
      return () => cancelAnimationFrame(id)
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])
  return { ref, inView }
}

// ---------------------------------------------------------------- Mapa do Brasil em pontinhos

type Region = 'Norte' | 'Nordeste' | 'Centro-Oeste' | 'Sudeste' | 'Sul'

export const REGIONS: Array<{ id: Region; watch: string; city: string; lon: number; lat: number }> = [
  { id: 'Norte', watch: 'Frete e abastecimento: quando a mercadoria demora a chegar, o preço sobe na prateleira.', city: 'Manaus', lon: -60.0, lat: -3.1 },
  { id: 'Nordeste', watch: 'Festas, turismo e safra: as datas que enchem (ou esvaziam) o caixa da loja.', city: 'Recife', lon: -34.9, lat: -8.05 },
  { id: 'Centro-Oeste', watch: 'Agro e renda do campo: quando a safra vai bem, o comércio da cidade sente.', city: 'Brasília', lon: -47.9, lat: -15.8 },
  { id: 'Sudeste', watch: 'Atacado e promoções dos grandes: o que muda na concorrência do seu bairro.', city: 'São Paulo', lon: -46.6, lat: -23.55 },
  { id: 'Sul', watch: 'Clima e estação: o frio e a chuva mudam o que sai mais rápido da prateleira.', city: 'Porto Alegre', lon: -51.2, lat: -30.0 },
]

// Contorno simplificado do Brasil (lon, lat). Só para o desenho em pontinhos — não é cartografia.
const OUTLINE: Array<[number, number]> = [
  [-60.7, 5.2], [-60.0, 5.2], [-57.5, 2.2], [-54.0, 2.2], [-51.6, 4.4], [-50.0, 1.8], [-49.0, -0.2], [-47.9, -0.6],
  [-44.5, -2.5], [-41.5, -2.9], [-38.5, -3.7], [-35.2, -5.4], [-34.8, -7.1], [-35.1, -9.0], [-37.0, -11.0],
  [-38.5, -13.0], [-39.0, -17.5], [-40.3, -20.3], [-41.0, -22.0], [-43.2, -23.0], [-46.3, -24.0], [-48.5, -26.0],
  [-48.6, -28.5], [-50.2, -30.5], [-52.0, -32.2], [-53.4, -33.7], [-55.5, -30.9], [-57.6, -30.2], [-55.7, -27.4],
  [-54.6, -25.6], [-54.3, -24.0], [-55.6, -22.6], [-57.9, -22.1], [-57.7, -18.0], [-58.4, -16.3], [-60.2, -15.1],
  [-60.0, -13.5], [-62.0, -13.0], [-65.0, -11.9], [-65.4, -9.8], [-68.0, -10.7], [-70.6, -11.0], [-72.4, -10.0],
  [-74.0, -7.5], [-72.9, -5.2], [-70.0, -4.2], [-69.6, -1.1], [-69.9, 1.1], [-67.0, 1.9], [-66.3, 0.8],
  [-63.4, 2.2], [-64.6, 4.0], [-62.8, 4.0],
]

function inside(lon: number, lat: number): boolean {
  let hit = false
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
    const [xi, yi] = OUTLINE[i]
    const [xj, yj] = OUTLINE[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

// Divisão aproximada por região, suficiente para acender os pontinhos de cada uma.
function regionOf(lon: number, lat: number): Region {
  if (lat <= -25.2 || (lat <= -22.6 && lon <= -51.5)) return 'Sul'
  if ((lat <= -19.8 && lon >= -53.1) || (lat <= -18 && lon >= -51) || (lat <= -14.2 && lon >= -51 && lon <= -39.5)) return 'Sudeste'
  if (lon >= -46.5 || (lon >= -48.5 && lat >= -10 && lat <= -1)) return 'Nordeste'
  if (lat >= -9.5 || lon <= -60 || (lon >= -50.7 && lat >= -13)) return 'Norte'
  return 'Centro-Oeste'
}

const STEP = 1.05
const SCALE = 10
const toX = (lon: number) => (lon + 75) * SCALE
const toY = (lat: number) => (6.5 - lat) * SCALE

export function BrazilDotMap() {
  const { ref, inView } = useInView<HTMLDivElement>(0.25)
  const [active, setActive] = useState<Region>('Sudeste')

  const dots = useMemo(() => {
    const list: Array<{ x: number; y: number; region: Region; delay: number }> = []
    for (let lat = 5.4; lat >= -33.8; lat -= STEP) {
      for (let lon = -74; lon <= -34.6; lon += STEP) {
        if (!inside(lon, lat)) continue
        const dist = Math.hypot(lon + 52, lat + 14)
        list.push({ x: toX(lon), y: toY(lat), region: regionOf(lon, lat), delay: Math.round(dist * 18) })
      }
    }
    return list
  }, [])

  const current = REGIONS.find((r) => r.id === active) ?? REGIONS[0]

  return (
    <div ref={ref} className={`${styles.nlMap} ${inView ? styles.nlOn : ''}`}>
      <svg viewBox="0 0 420 420" role="img" aria-label={`Mapa do Brasil em pontos, região ${current.id} em destaque`}>
        {dots.map((dot, index) => (
          <circle
            key={index}
            cx={dot.x}
            cy={dot.y}
            r={3.1}
            className={dot.region === active ? styles.nlDotActive : styles.nlDot}
            style={{ transitionDelay: `${dot.delay}ms` } as CSSProperties}
          />
        ))}
        {REGIONS.map((region) => (
          <g key={region.id} className={region.id === active ? styles.nlPinActive : styles.nlPin}>
            <circle cx={toX(region.lon)} cy={toY(region.lat)} r={6} className={styles.nlPinRing} />
            <circle cx={toX(region.lon)} cy={toY(region.lat)} r={4.5} className={styles.nlPinCore} />
          </g>
        ))}
      </svg>
      <div className={styles.nlMapPanel}>
        <div className={styles.nlChips} role="tablist" aria-label="Regiões">
          {REGIONS.map((region) => (
            <button
              key={region.id}
              type="button"
              role="tab"
              aria-selected={region.id === active}
              className={region.id === active ? styles.nlChipActive : styles.nlChip}
              onClick={() => setActive(region.id)}
              onMouseEnter={() => setActive(region.id)}
              onFocus={() => setActive(region.id)}
            >
              {region.id}
            </button>
          ))}
        </div>
        <p className={styles.nlMapText} aria-live="polite">
          <b>{current.id}</b> · {current.watch}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Gráfico de linha

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']
const SERIES = [58, 46, 64, 61, 86] // exemplo ilustrativo

export function LineChartDemo() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4)
  const [hover, setHover] = useState<number | null>(4)
  const W = 320
  const H = 150
  const pad = 18
  const max = 100
  const points = SERIES.map((value, index) => ({
    x: pad + (index * (W - pad * 2)) / (SERIES.length - 1),
    y: H - pad - (value / max) * (H - pad * 2),
    value,
  }))
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${line} L${points[points.length - 1].x},${H - pad} L${points[0].x},${H - pad} Z`
  const shown = hover ?? 4

  return (
    <div ref={ref} className={`${styles.nlChart} ${inView ? styles.nlOn : ''}`}>
      <div className={styles.nlChartHead}>
        <span>Movimento do caixa na semana</span>
        <b>
          {DAYS[shown]} · {SERIES[shown]}
        </b>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label="Exemplo ilustrativo de gráfico de linha com o movimento da semana">
        <defs>
          <linearGradient id="nlArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0061e2" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#0061e2" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad} x2={W - pad} y1={pad + f * (H - pad * 2)} y2={pad + f * (H - pad * 2)} className={styles.nlGrid} />
        ))}
        <path d={area} fill="url(#nlArea)" className={styles.nlArea} />
        <path d={line} pathLength={1} className={styles.nlLine} />
        {points.map((p, index) => (
          <g key={DAYS[index]} onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)} tabIndex={0} aria-label={`${DAYS[index]}: ${p.value}`}>
            <rect x={p.x - 24} y={0} width={48} height={H} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={index === shown ? 6 : 4} className={index === shown ? styles.nlPointActive : styles.nlPoint} />
            <text x={p.x} y={H + 16} textAnchor="middle" className={styles.nlAxis}>
              {DAYS[index]}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------- Ranking em barras

const RANKING: Array<[string, number]> = [
  ['Refrigerante 2L', 92],
  ['Pão francês', 81],
  ['Café 500 g', 64],
  ['Leite 1 L', 57],
  ['Detergente', 38],
]

export function RankingBars() {
  const { ref, inView } = useInView<HTMLOListElement>(0.4)
  return (
    <ol ref={ref} className={`${styles.nlBars} ${inView ? styles.nlOn : ''}`} aria-label="Exemplo ilustrativo de ranking de produtos que mais giram">
      {RANKING.map(([label, value], index) => (
        <li key={label}>
          <span>{label}</span>
          <i style={{ '--w': `${value}%`, transitionDelay: `${index * 110}ms` } as CSSProperties} />
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------- Número animado

export function CountUp({ to, prefix = '', suffix = '', decimals = 0 }: { to: number; prefix?: string; suffix?: string; decimals?: number }) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.6)
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!inView) return
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = reduce ? 1 : Math.min(1, (now - start) / 1300)
      setValue(to * (1 - Math.pow(1 - t, 3)))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [inView, to])
  return (
    <span ref={ref}>
      {prefix}
      {value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  )
}

// ---------------------------------------------------------------- Prévia da edição no celular

export function EditionPhone() {
  return (
    <div className={styles.nlPhone} aria-label="Prévia de uma edição do Radar do Lojista (exemplo)">
      <div className={styles.nlPhoneNotch} />
      <div className={styles.nlMail}>
        <div className={styles.nlMailTop}>
          <span className={styles.nlMailLogo}>R</span>
          <div>
            <b>Radar do Lojista</b>
            <small>hoje · 06:00</small>
          </div>
        </div>
        <h4>Bom dia! O que mexe na sua loja hoje ☕</h4>
        <div className={styles.nlMailBlock}>
          <small>📍 MAPA DO DIA</small>
          <div className={styles.nlMiniDots} aria-hidden="true">
            {Array.from({ length: 36 }, (_, i) => (
              <i key={i} className={[3, 8, 9, 14, 15, 16, 21, 22, 27].includes(i) ? styles.nlMiniDotOn : undefined} />
            ))}
          </div>
        </div>
        <div className={styles.nlMailBlock}>
          <small>📈 GRÁFICO DO DIA</small>
          <svg viewBox="0 0 120 34" aria-hidden="true">
            <path d="M2,26 L28,22 L52,27 L78,14 L104,16 L118,5" className={styles.nlMiniLine} />
          </svg>
        </div>
        <div className={styles.nlMailRow}>
          <div className={styles.nlMailBlock}>
            <small>🔢 NÚMERO</small>
            <strong>3 min</strong>
          </div>
          <div className={styles.nlMailBlock}>
            <small>💡 DICA</small>
            <p>Confira a margem antes de dar desconto.</p>
          </div>
        </div>
        <span className={styles.nlMailTag}>Exemplo de edição</span>
      </div>
    </div>
  )
}
