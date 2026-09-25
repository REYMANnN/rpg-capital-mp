'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Package, X } from 'lucide-react'
import {
  centsToInput, lookupCatalog, milliToInput, money, parseMoney, parseQty, qty,
  type ProductFields, type Unit, type WaProduct,
} from './shared'
import styles from './r.module.css'

type Props = {
  barcode: string
  product: WaProduct | null
  // Cadastro: pede estoque inicial? (na entrada o estoque vem da tela de entrada)
  askStock?: boolean
  saving?: boolean
  title?: string
  onSave: (fields: ProductFields) => Promise<void> | void
  onClose: () => void
  children?: ReactNode
}

// Perfil do produto: mostra e edita preço, custo e estoque. Sem produto, vira cadastro.
export default function ProductSheet({ barcode, product, askStock = true, saving = false, title, onSave, onClose, children }: Props) {
  const registering = !product
  const [name, setName] = useState(product?.name || '')
  const [unit, setUnit] = useState<Unit>(product?.unit === 'KG' ? 'KG' : 'UN')
  const [price, setPrice] = useState(product ? centsToInput(product.priceCents) : '')
  const [cost, setCost] = useState(product ? centsToInput(product.averageCostCents || 0) : '')
  const [stock, setStock] = useState(product ? milliToInput(product.stockMilli) : askStock ? '' : '0')
  const [minStock, setMinStock] = useState(product ? milliToInput(product.minStockMilli) : '')
  const [catalog, setCatalog] = useState<{ brand: string; imageUrl: string } | null>(null)
  const [looking, setLooking] = useState(registering)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!registering) return
    let cancelled = false
    lookupCatalog(barcode).then((found) => {
      if (cancelled) return
      setLooking(false)
      if (!found) return
      setCatalog({ brand: found.brand, imageUrl: found.imageUrl })
      setName((current) => current || found.name)
    })
    return () => { cancelled = true }
  }, [barcode, registering])

  const priceCents = parseMoney(price)
  const costCents = cost.trim() ? parseMoney(cost) : 0
  const stockMilli = stock.trim() ? parseQty(stock) : 0
  const minStockMilli = minStock.trim() ? parseQty(minStock) : 0

  const changed = useMemo(() => {
    if (registering) return true
    return priceCents !== product!.priceCents
      || costCents !== (product!.averageCostCents || 0)
      || stockMilli !== product!.stockMilli
      || minStockMilli !== product!.minStockMilli
      || name.trim() !== product!.name
  }, [registering, product, priceCents, costCents, stockMilli, minStockMilli, name])

  const marginCents = Number.isFinite(priceCents) && Number.isFinite(costCents) && costCents > 0 ? priceCents - costCents : null
  const marginPct = marginCents !== null && priceCents > 0 ? (marginCents / priceCents) * 100 : null

  async function submit() {
    setError('')
    if (!name.trim()) return setError('Coloque o nome do produto.')
    if (!Number.isFinite(priceCents) || priceCents <= 0) return setError('Coloque o preço de venda.')
    if (!Number.isFinite(costCents) || costCents < 0) return setError('Custo inválido.')
    if (registering && costCents <= 0) return setError('Coloque quanto você paga no produto (custo).')
    if (!Number.isFinite(stockMilli) || stockMilli < 0) return setError('Estoque inválido.')
    if (!Number.isFinite(minStockMilli) || minStockMilli < 0) return setError('Estoque mínimo inválido.')
    try {
      await onSave({
        name: name.trim(), unit, priceCents, averageCostCents: costCents, stockMilli, minStockMilli,
        ...(catalog ? { catalogSource: 'lookup', catalogBrand: catalog.brand || undefined, catalogImageUrl: catalog.imageUrl || undefined } : {}),
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não consegui salvar.')
    }
  }

  const image = product?.catalogImageUrl || catalog?.imageUrl

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.grab} />
        <div className={styles.sheetHead}>
          {image ? <img className={styles.sheetImg} src={image} alt="" /> : <div className={styles.sheetImg}><Package /></div>}
          <div className={styles.grow}>
            <div className={styles.sheetTitle}>{title || (registering ? 'Produto novo' : product!.name)}</div>
            <div className={styles.code}>{barcode}</div>
            {!registering && <div className={styles.meta}>{money(product!.priceCents)} · {qty(product!.stockMilli, product!.unit)} em estoque</div>}
          </div>
          <button className={styles.linkBtn} onClick={onClose} aria-label="Fechar"><X /></button>
        </div>

        {children}

        {registering && (
          <div className={styles.alert} style={{ marginBottom: 12 }}>
            {looking ? 'Procurando esse código no catálogo…' : 'Esse código não está na sua loja. Complete para cadastrar.'}
          </div>
        )}

        <div className={styles.grid2}>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span>Nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Arroz Tio João 5kg" style={{ fontSize: 16 }} />
          </label>
          <label className={styles.field}>
            <span>Preço de venda (R$)</span>
            <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
          </label>
          <label className={styles.field}>
            <span>Custo (R$)</span>
            <input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" />
          </label>
          {(askStock || !registering) && (
            <label className={styles.field}>
              <span>Estoque</span>
              <input inputMode="decimal" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" />
            </label>
          )}
          <label className={styles.field}>
            <span>Avisar quando tiver</span>
            <input inputMode="decimal" value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="0" />
          </label>
          {registering && (
            <label className={styles.field}>
              <span>Vende por</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value === 'KG' ? 'KG' : 'UN')}>
                <option value="UN">Unidade</option>
                <option value="KG">Quilo</option>
              </select>
            </label>
          )}
        </div>

        {marginCents !== null && (
          <div className={`${styles.margin} ${marginCents >= 0 ? styles.marginGood : styles.marginBad}`}>
            Margem: {money(marginCents)} por {unit === 'KG' ? 'kg' : 'unidade'}{marginPct !== null ? ` (${marginPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)` : ''}
          </div>
        )}
        {error && <div className={styles.margin} style={{ color: 'var(--danger)' }}>{error}</div>}

        <div style={{ marginTop: 14 }}>
          <button className={styles.btn} disabled={saving || !changed} onClick={submit}>
            {saving ? 'Salvando…' : registering ? 'Cadastrar produto' : changed ? 'Salvar alterações' : 'Sem alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}
