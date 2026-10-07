'use client'

import type { MouseEvent, ReactNode } from 'react'
import styles from './site.module.css'

/** Card que acende onde o mouse passa. */
export default function Spotlight({ children }: { children: ReactNode }) {
  const onMove = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`)
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`)
  }
  return (
    <article className={styles.spotlight} onMouseMove={onMove}>
      {children}
    </article>
  )
}
