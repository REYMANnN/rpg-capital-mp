'use client'

import { useId, useState } from 'react'
import styles from './site.module.css'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

function toNumber(value: string) {
  const raw = value.replace(/[^\d.,-]/g, '')
  // "1.234,56" → vírgula é decimal; "9.90" (sem vírgula, até 2 casas) → ponto é decimal; "20.000" → milhar.
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : /^\d+\.\d{1,2}$/.test(raw)
      ? raw
      : raw.replace(/\./g, '')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function MoneyField({ label, value, onChange, suffix }: { label: string; value: string; onChange: (value: string) => void; suffix?: string }) {
  const id = useId()
  return (
    <label className={styles.field} htmlFor={id}>
      {label}
      <input id={id} inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} placeholder={suffix ? `0 ${suffix}` : 'R$ 0,00'} />
    </label>
  )
}

export function MarginCalculator() {
  const [cost, setCost] = useState('6,50')
  const [price, setPrice] = useState('9,90')
  const c = toNumber(cost)
  const p = toNumber(price)
  const profit = p - c
  const margin = p > 0 ? (profit / p) * 100 : 0
  const markup = c > 0 ? (profit / c) * 100 : 0
  const valid = c > 0 && p > 0

  return (
    <article className={styles.calc}>
      <h3>Margem e markup</h3>
      <p>Quanto você ganha de verdade em cada produto?</p>
      <div className={styles.formRow}>
        <MoneyField label="Custo do produto (R$)" value={cost} onChange={setCost} />
        <MoneyField label="Preço de venda (R$)" value={price} onChange={setPrice} />
      </div>
      <div className={styles.calcResult} aria-live="polite">
        <small>Você ganha por unidade</small>
        <strong>{valid ? brl.format(profit) : '—'}</strong>
        <span>
          {valid
            ? `Margem de ${pct.format(margin)}% sobre o preço · markup de ${pct.format(markup)}% sobre o custo.`
            : 'Preencha o custo e o preço de venda.'}
        </span>
      </div>
    </article>
  )
}

export function CardFeeCalculator() {
  const [revenue, setRevenue] = useState('20.000')
  const [fee, setFee] = useState('3,5')
  const r = toNumber(revenue)
  const f = toNumber(fee)
  const monthly = (r * f) / 100
  const valid = r > 0 && f > 0

  return (
    <article className={styles.calc}>
      <h3>Quanto a maquininha leva</h3>
      <p>Coloque quanto você vende no cartão por mês e a taxa média que paga.</p>
      <div className={styles.formRow}>
        <MoneyField label="Vendas no cartão por mês (R$)" value={revenue} onChange={setRevenue} />
        <MoneyField label="Taxa média (%)" value={fee} onChange={setFee} suffix="%" />
      </div>
      <div className={styles.calcResult} aria-live="polite">
        <small>A maquininha leva por mês</small>
        <strong>{valid ? brl.format(monthly) : '—'}</strong>
        <span>{valid ? `São ${brl.format(monthly * 12)} por ano saindo da sua margem.` : 'Preencha as vendas e a taxa.'}</span>
      </div>
    </article>
  )
}
