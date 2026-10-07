'use client'

import { useEffect, useState } from 'react'
import styles from './site.module.css'

/** Palavra que vai trocando sozinha, com a anterior saindo por cima. */
export default function RotatingWord({ words, interval = 2200 }: { words: string[]; interval?: number }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % words.length), interval)
    return () => window.clearInterval(timer)
  }, [words.length, interval])

  const longest = words.reduce((a, b) => (b.length > a.length ? b : a), '')

  return (
    <span className={styles.rotator} aria-live="polite">
      <span className={styles.rotatorSizer} aria-hidden="true">
        {longest}
      </span>
      {words.map((word, i) => (
        <span
          key={word}
          className={`${styles.rotatorWord} ${i === index ? styles.rotatorIn : ''} ${
            i === (index - 1 + words.length) % words.length ? styles.rotatorOut : ''
          }`}
          aria-hidden={i !== index}
        >
          {word}
        </span>
      ))}
    </span>
  )
}
