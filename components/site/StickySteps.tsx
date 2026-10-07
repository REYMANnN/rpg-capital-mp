'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './site.module.css'

export type StickyStep = {
  tag: string
  title: string
  text: string
  image: string
  alt: string
}

/** Texto rola à esquerda; a imagem à direita fica parada e troca a cada passo. */
export default function StickySteps({ steps }: { steps: StickyStep[] }) {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index))
        })
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    refs.current.forEach((node) => node && observer.observe(node))
    return () => observer.disconnect()
  }, [])

  return (
    <div className={styles.sticky}>
      <div className={styles.stickySteps}>
        {steps.map((step, index) => (
          <div
            key={step.title}
            ref={(node) => {
              refs.current[index] = node
            }}
            data-index={index}
            className={index === active ? styles.stickyStepActive : styles.stickyStep}
          >
            <span className={styles.stepTag}>{step.tag}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </div>
        ))}
      </div>
      <div className={styles.stickyVisual} aria-hidden="true">
        <div className={styles.stickyImages}>
          {steps.map((step, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={step.image} src={step.image} alt="" className={index === active ? styles.visible : undefined} loading="lazy" />
          ))}
        </div>
      </div>
    </div>
  )
}
