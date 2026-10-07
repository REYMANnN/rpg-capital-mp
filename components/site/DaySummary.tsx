'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './site.module.css'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

// Vendas por hora (exemplo de tela): 8h às 19h.
const HOURLY = [40, 65, 110, 95, 70, 120, 150, 105, 90, 140, 160, 105]
const TOP = [
  ['Arroz 5kg', 18],
  ['Óleo 900ml', 14],
  ['Açúcar 1kg', 11],
] as const

function sparkPath(values: number[], w: number, h: number) {
  const max = Math.max(...values)
  const step = w / (values.length - 1)
  return values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - (v / max) * (h - 6) - 3).toFixed(1)}`).join(' ')
}

/** O resumo que a Rafa manda no fim do dia, em formato de mensagem do WhatsApp. */
export default function DaySummary() {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    let frame = 0
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        setShown(true)
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const start = performance.now()
        const run = (now: number) => {
          const p = reduced ? 1 : Math.min(1, (now - start) / 1400)
          setTotal(Math.round(1250 * (1 - Math.pow(1 - p, 3))))
          if (p < 1) frame = requestAnimationFrame(run)
        }
        frame = requestAnimationFrame(run)
      },
      { threshold: 0.35 },
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  const path = sparkPath(HOURLY, 300, 64)

  return (
    <div ref={ref} className={`${styles.summary} ${shown ? styles.summaryOn : ''}`} role="img" aria-label="Exemplo do resumo do dia que a Rafa envia no WhatsApp: R$ 1.250 em 47 vendas">
      <div className={styles.summaryHead}>
        <span className={styles.avatar}>R</span>
        <span>
          <b>Rafa · RPG</b>
          <small>hoje, 19:02</small>
        </span>
      </div>
      <div className={styles.summaryBody}>
        <p className={styles.summaryTitle}>Resumo de hoje 📊</p>
        <div className={styles.summaryTotal}>
          <strong>{brl.format(total)}</strong>
          <span className={styles.summaryUp}>▲ 12% vs ontem</span>
        </div>
        <p className={styles.summaryMeta}>47 vendas · ticket médio R$ 26,60</p>
        <svg className={styles.spark} viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden="true">
          <path d={`${path} L300,64 L0,64 Z`} className={styles.sparkFill} />
          <path d={path} className={styles.sparkLine} pathLength={1} />
        </svg>
        <div className={styles.summaryHours} aria-hidden="true">
          <span>8h</span>
          <span>13h</span>
          <span>19h</span>
        </div>

        <p className={styles.summaryLabel}>Mais vendidos</p>
        {TOP.map(([name, qty], i) => (
          <div key={name} className={styles.topRow}>
            <span>{name}</span>
            <span className={styles.topBar}>
              <i style={{ width: `${(qty / TOP[0][1]) * 100}%`, transitionDelay: `${300 + i * 120}ms` }} />
            </span>
            <b>{qty}</b>
          </div>
        ))}

        <p className={styles.summaryLabel}>Acabando</p>
        <div className={styles.lowChips}>
          <span>Feijão 1kg · 3 un.</span>
          <span>Leite · 5 un.</span>
        </div>
      </div>
      <div className={styles.quickReplies} aria-hidden="true">
        <span>Gerar lista de compras</span>
        <span>Ver painel</span>
      </div>
    </div>
  )
}
