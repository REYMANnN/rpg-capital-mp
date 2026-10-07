'use client'

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react'
import styles from './site.module.css'

type RevealProps = {
  children: ReactNode
  as?: ElementType
  className?: string
  delay?: number
  /** Classe extra aplicada quando o bloco entra na tela (ex.: estado "resolvido"). */
  activeClassName?: string
  id?: string
}

/** Faz o bloco subir e aparecer uma vez, quando entra na tela. */
export default function Reveal({ children, as: Tag = 'div', className = '', delay = 0, activeClassName = '', id }: RevealProps) {
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      const frame = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(frame)
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const classes = [styles.reveal, visible ? styles.revealed : '', visible ? activeClassName : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <Tag ref={ref} id={id} className={classes} style={{ '--delay': `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  )
}
