'use client'

import { useEffect, useState } from 'react'
import RafaChat from './RafaChat'
import TiltCard from './TiltCard'
import styles from './site.module.css'

const NOTES = [
  { icon: '✓', tone: 'green', title: 'Venda registrada', text: 'Estoque atualizado sozinho' },
  { icon: '⚡', tone: 'blue', title: 'Pix recebido', text: 'R$ 28,50 · QR gerado pela Rafa' },
  { icon: '🧾', tone: 'yellow', title: 'Nota fiscal lida', text: '14 produtos entraram no estoque' },
  { icon: '!', tone: 'red', title: 'Estoque baixo', text: 'Feijão 1kg · restam 3' },
  { icon: '💳', tone: 'blue', title: 'Cartão aprovado', text: 'Aproximação no celular' },
  { icon: '📊', tone: 'green', title: 'Resumo do dia pronto', text: '47 vendas hoje' },
] as const

const SLOTS = ['slotA', 'slotB', 'slotC'] as const

/** Celular da Rafa com notificações que vão aparecendo em volta. */
export default function HeroPhone() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setTick((t) => t + 1), 1400)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className={styles.heroStage}>
      <TiltCard className={styles.heroPhoneTilt} max={8}>
        <RafaChat />
      </TiltCard>
      {SLOTS.map((slot, i) => {
        // Cada posição troca numa batida diferente, para as notificações não mudarem todas juntas.
        const round = Math.floor((tick + (SLOTS.length - i)) / SLOTS.length)
        const note = NOTES[(round * SLOTS.length + i) % NOTES.length]
        return (
          <div key={`${slot}-${round}`} className={`${styles.note} ${styles[slot]}`} aria-hidden="true">
            <span className={`${styles.noteIcon} ${styles[`tone_${note.tone}`]}`}>{note.icon}</span>
            <span>
              <strong>{note.title}</strong>
              <small>{note.text}</small>
            </span>
          </div>
        )
      })}
    </div>
  )
}
