'use client'

import { useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import styles from './site.module.css'

/** Card que inclina levemente e acende onde o mouse passa. */
export default function TiltCard({
  children,
  className = '',
  max = 6,
  style,
}: {
  children: ReactNode
  className?: string
  max?: number
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)

  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    node.style.setProperty('--mx', `${x * 100}%`)
    node.style.setProperty('--my', `${y * 100}%`)
    node.style.setProperty('--rx', `${(0.5 - y) * max}deg`)
    node.style.setProperty('--ry', `${(x - 0.5) * max}deg`)
  }

  const onLeave = () => {
    const node = ref.current
    if (!node) return
    node.style.setProperty('--rx', '0deg')
    node.style.setProperty('--ry', '0deg')
  }

  return (
    <div ref={ref} className={`${styles.tilt} ${className}`} style={style} onMouseMove={onMove} onMouseLeave={onLeave}>
      {children}
    </div>
  )
}
