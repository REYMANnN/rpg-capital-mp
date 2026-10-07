'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './site.module.css'

const REQUEST = `GET /api/public/v1/products
Authorization: Bearer rpg_dev_live_...
X-RPG-Connection-Id: 5c62...`

const RESPONSE = `{
  "data": [...]
}`

/** Terminal que digita a chamada de exemplo da API e mostra a resposta. */
export default function Terminal() {
  const ref = useRef<HTMLDivElement>(null)
  const [typed, setTyped] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const frame = requestAnimationFrame(() => {
        setTyped(REQUEST)
        setDone(true)
      })
      return () => cancelAnimationFrame(frame)
    }
    let timer = 0
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      let i = 0
      const tick = () => {
        i += 1
        setTyped(REQUEST.slice(0, i))
        if (i < REQUEST.length) timer = window.setTimeout(tick, REQUEST[i - 1] === '\n' ? 260 : 22)
        else timer = window.setTimeout(() => setDone(true), 450)
      }
      timer = window.setTimeout(tick, 400)
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <div ref={ref} className={styles.terminal}>
      <div className={styles.terminalBar} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <pre aria-label="Exemplo de chamada da API da RPG">
        <code>
          <span className={styles.key}>{typed}</span>
          {!done && <span className={styles.caret} aria-hidden="true" />}
          {done && (
            <>
              {'\n\n'}
              <span className={styles.ok}>200 OK</span>
              {'\n'}
              {RESPONSE}
            </>
          )}
        </code>
      </pre>
    </div>
  )
}
