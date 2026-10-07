'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './site.module.css'

/** Frase que acende palavra por palavra conforme a pessoa rola a página. */
export default function ScrollWords({ text, accent = [] }: { text: string; accent?: string[] }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const words = text.split(' ')
  const [lit, setLit] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const frame = requestAnimationFrame(() => setLit(words.length))
      return () => cancelAnimationFrame(frame)
    }
    let frame = 0
    const update = () => {
      frame = 0
      const rect = node.getBoundingClientRect()
      const viewport = window.innerHeight
      // 0 quando o topo da frase chega a 85% da tela; 1 quando o fim passa de 45%.
      const progress = (viewport * 0.85 - rect.top) / (rect.height + viewport * 0.4)
      setLit(Math.round(Math.min(1, Math.max(0, progress)) * words.length))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [words.length])

  return (
    <p ref={ref} className={styles.manifestoText} aria-label={text}>
      {words.map((word, index) => {
        const clean = word.replace(/[.,]/g, '')
        const classes = [styles.word, index < lit ? styles.lit : '', accent.includes(clean) ? styles.accent : '']
          .filter(Boolean)
          .join(' ')
        return (
          <span key={index} aria-hidden="true">
            <span className={classes}>{word}</span>{' '}
          </span>
        )
      })}
    </p>
  )
}
