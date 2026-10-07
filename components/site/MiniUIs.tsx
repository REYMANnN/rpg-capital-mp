'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './site.module.css'

/** Conta "batidas" enquanto o bloco está na tela; para quando sai (economiza bateria). */
function useTicker(interval: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let timer = 0
    const observer = new IntersectionObserver(([entry]) => {
      window.clearInterval(timer)
      if (entry.isIntersecting) timer = window.setInterval(() => setTick((t) => t + 1), interval)
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
      window.clearInterval(timer)
    }
  }, [interval])

  return [ref, tick] as const
}

const NOTA_ITEMS = [
  ['Arroz 5kg', '10'],
  ['Feijão 1kg', '12'],
  ['Óleo de soja 900ml', '6'],
  ['Açúcar 1kg', '10'],
  ['Macarrão 500g', '20'],
]

/** Nota fiscal sendo lida: a linha de leitura passa e os itens entram com ✓. */
export function NotaScan() {
  const [ref, tick] = useTicker(700)
  const read = tick % (NOTA_ITEMS.length + 3)

  return (
    <div ref={ref} className={styles.mini} aria-hidden="true">
      <div className={styles.receipt}>
        <div className={styles.receiptHead}>
          <b>NOTA FISCAL</b>
          <span>Distribuidora · 14 itens</span>
        </div>
        {NOTA_ITEMS.map(([name, qty], i) => (
          <div key={name} className={`${styles.receiptRow} ${i < read ? styles.receiptRead : ''}`}>
            <span>{name}</span>
            <span>×{qty}</span>
            <i>✓</i>
          </div>
        ))}
        <span className={styles.scanLine} style={{ top: `${18 + Math.min(read, NOTA_ITEMS.length) * 15}%` }} />
      </div>
      <div className={styles.miniToast}>{read >= NOTA_ITEMS.length ? '14 produtos no estoque ✓' : 'Lendo a nota…'}</div>
    </div>
  )
}

const CART = [
  ['Coca-Cola 2L', 'R$ 11,90'],
  ['Pão de forma', 'R$ 8,99'],
  ['Leite integral', 'R$ 5,49'],
]

/** Venda sendo montada: produtos entram, total sobe, estoque baixa. */
export function VendaFeed() {
  const [ref, tick] = useTicker(900)
  const step = tick % (CART.length + 3)
  const shown = Math.min(step, CART.length)
  const totals = ['R$ 0,00', 'R$ 11,90', 'R$ 20,89', 'R$ 26,38']
  const done = step > CART.length

  return (
    <div ref={ref} className={styles.mini} aria-hidden="true">
      <div className={styles.cart}>
        <div className={styles.cartHead}>
          <span>Venda</span>
          <span className={styles.scanBadge}>▮▯▮▮▯▮ escaneando</span>
        </div>
        {CART.slice(0, shown).map(([name, price]) => (
          <div key={name} className={styles.cartRow}>
            <span>{name}</span>
            <b>{price}</b>
            <em>estoque −1</em>
          </div>
        ))}
        <div className={styles.cartTotal}>
          <span>Total</span>
          <b>{totals[shown]}</b>
        </div>
        <div className={`${styles.cartDone} ${done ? styles.cartDoneOn : ''}`}>Venda registrada ✓</div>
      </div>
    </div>
  )
}

// QR Code ilustrativo 21×21: três marcadores de canto + preenchimento pseudoaleatório fixo.
const QR_SIZE = 21
const QR_CELLS = Array.from({ length: QR_SIZE * QR_SIZE }, (_, i) => {
  const x = i % QR_SIZE
  const y = Math.floor(i / QR_SIZE)
  const finder = (fx: number, fy: number) => {
    const dx = x - fx
    const dy = y - fy
    if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null
    const edge = dx === 0 || dy === 0 || dx === 6 || dy === 6
    const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4
    return edge || core
  }
  const f = finder(0, 0) ?? finder(14, 0) ?? finder(0, 14)
  if (f !== null) return f
  if ((x === 7 || y === 7) && (x < 8 || y < 8)) return false
  if (x === 13 && y < 8) return false
  if (y === 13 && x < 8) return false
  return ((x * 37 + y * 101 + x * y * 7) % 11) % 2 === 0
})

/** Alterna entre Pix (QR) e cartão por aproximação, como as telas da Rafa. */
export function PayToggle() {
  const [ref, tick] = useTicker(2600)
  const card = tick % 2 === 1

  return (
    <div ref={ref} className={styles.mini} aria-hidden="true">
      <div className={styles.payTabs}>
        <span className={!card ? styles.payTabOn : ''}>Pix</span>
        <span className={card ? styles.payTabOn : ''}>Cartão</span>
      </div>
      <div className={styles.payScreen}>
        <small>Total da venda</small>
        <strong>{card ? 'R$ 52,90' : 'R$ 28,50'}</strong>
        {card ? (
          <div className={styles.nfc} key="card">
            <span />
            <span />
            <b>)))</b>
            <small>Aproxime o cartão do celular</small>
          </div>
        ) : (
          <div className={styles.qr} key="pix">
            {QR_CELLS.map((on, i) => (
              <i key={i} className={on ? styles.qrOn : ''} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const STOCK = [
  ['Feijão 1kg', [40, 22, 9]],
  ['Leite integral', [70, 52, 30]],
  ['Arroz 5kg', [90, 80, 72]],
] as const

/** Estoque baixando a cada venda; o que fica baixo acende em vermelho. */
export function StockBars() {
  const [ref, tick] = useTicker(1200)
  const phase = tick % 4

  return (
    <div ref={ref} className={styles.mini} aria-hidden="true">
      {STOCK.map(([name, levels]) => {
        const level = levels[Math.min(phase, levels.length - 1)]
        const low = level < 25
        return (
          <div key={name} className={styles.stockRow}>
            <div>
              <span>{name}</span>
              {low && <em>Repor</em>}
            </div>
            <div className={styles.stockTrack}>
              <span className={low ? styles.stockLow : ''} style={{ width: `${level}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
