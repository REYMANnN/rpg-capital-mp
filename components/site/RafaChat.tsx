'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './site.module.css'

export type ChatMessage = {
  from: 'rafa' | 'user'
  text: string
  media?: boolean
}

const DEFAULT_SCRIPT: ChatMessage[] = [
  { from: 'rafa', text: 'Oi! Sou a Rafa, sua assistente da RPG. Posso te ajudar com estoque, vendas e o controle do dia a dia.' },
  { from: 'user', text: 'Preciso repor arroz e óleo', media: true },
  { from: 'rafa', text: 'Entendi! Arroz e óleo já entraram na sua lista de compras.' },
  { from: 'user', text: 'vendi 2 coca 2L e 1 pão de forma' },
  { from: 'rafa', text: 'Venda registrada com sucesso! O estoque já foi atualizado. ✅' },
  { from: 'user', text: 'como foi o dia hoje?' },
  { from: 'rafa', text: 'Dia bom! Os mais vendidos foram arroz, óleo e açúcar. Feijão e leite estão acabando — já separei na lista.' },
]

const VISIBLE_AT_ONCE = 5

/** Celular com uma conversa de exemplo da Rafa que se escreve sozinha. */
export default function RafaChat({ script = DEFAULT_SCRIPT, label = 'Exemplo de conversa com a Rafa no WhatsApp' }: { script?: ChatMessage[]; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(0)
  const [typing, setTyping] = useState(false)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const frame = requestAnimationFrame(() => setCount(script.length))
      return () => cancelAnimationFrame(frame)
    }
    const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { threshold: 0.25 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [script.length])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const timers: number[] = []
    const wait = (ms: number) => new Promise<void>((resolve) => timers.push(window.setTimeout(resolve, ms)))

    const run = async () => {
      let from = count
      while (!cancelled) {
        for (let i = from; i < script.length && !cancelled; i++) {
          const message = script[i]
          if (message.from === 'rafa') {
            setTyping(true)
            await wait(900)
            setTyping(false)
          } else {
            await wait(700)
          }
          if (cancelled) return
          setCount(i + 1)
          await wait(message.from === 'rafa' ? 1500 : 500)
        }
        await wait(3200)
        if (cancelled) return
        setCount(0)
        from = 0
        await wait(400)
      }
    }
    run()
    return () => {
      cancelled = true
      timers.forEach((timer) => window.clearTimeout(timer))
    }
    // count é lido só no começo de cada ciclo; o loop controla o resto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, script])

  const shown = script.slice(0, count).slice(-VISIBLE_AT_ONCE)
  const offset = Math.max(0, count - VISIBLE_AT_ONCE)

  return (
    <div ref={ref} className={styles.phone} role="img" aria-label={label}>
      <div className={styles.phoneScreen}>
        <div className={styles.phoneTop}>
          <span className={styles.avatar}>R</span>
          <span>
            <strong>Rafa · RPG</strong>
            <small>{typing ? 'digitando…' : 'online'}</small>
          </span>
        </div>
        <div className={styles.chatBody}>
          {shown.map((message, index) => (
            <div key={offset + index} className={message.from === 'rafa' ? styles.bubbleRafa : styles.bubbleUser}>
              {message.media ? (
                <span className={styles.bubbleMedia}>
                  <span aria-hidden="true" />
                  {message.text}
                </span>
              ) : (
                message.text
              )}
            </div>
          ))}
          {typing && (
            <div className={styles.typing} aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
        <div className={styles.phoneInput} aria-hidden="true">
          <span>Mensagem</span>
          <b>🎤</b>
        </div>
      </div>
    </div>
  )
}
