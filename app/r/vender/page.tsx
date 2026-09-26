'use client'

import { useMemo, useState } from 'react'
import { Banknote, CheckCircle2, CreditCard, QrCode, Search, Trash2 } from 'lucide-react'
import type { PaymentMethod } from '@/lib/inventory/core'
import ContinuousScanner from '../ContinuousScanner'
import ProductSheet from '../ProductSheet'
import Shell, { Toast } from '../Shell'
import {
  activeProducts, applySale, findByBarcode, money, normalize, notifyWhatsApp, qty, registerProduct,
  useToast, useWaStore, type WaProduct,
} from '../shared'
import styles from '../r.module.css'

type Line = { productId: string; quantityMilli: number }

const PAYMENTS: Array<{ id: PaymentMethod; label: string; icon: typeof QrCode }> = [
  { id: 'pix', label: 'Pix', icon: QrCode },
  { id: 'card', label: 'Cartão', icon: CreditCard },
  { id: 'cash', label: 'Dinheiro', icon: Banknote },
]

export default function VenderPage() {
  const { state, status, saving, commit } = useWaStore()
  const { toast, show } = useToast()
  const [cart, setCart] = useState<Line[]>([])
  const [unknownCode, setUnknownCode] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('pix')
  const [done, setDone] = useState<{ totalCents: number } | null>(null)
  const [session, setSession] = useState({ count: 0, totalCents: 0 })
  const [query, setQuery] = useState('')
  const [closed, setClosed] = useState(false)

  const products = useMemo(() => activeProducts(state), [state])
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const totalCents = cart.reduce((sum, line) => sum + Math.round((byId.get(line.productId)?.priceCents || 0) * line.quantityMilli / 1000), 0)
  const itemCount = cart.reduce((sum, line) => sum + line.quantityMilli / 1000, 0)

  const results = useMemo(() => {
    const q = normalize(query.trim())
    if (q.length < 2) return []
    return products.filter((p) => normalize(p.name).includes(q) || p.barcode.includes(q)).slice(0, 6)
  }, [products, query])

  function add(product: WaProduct) {
    if (product.priceCents <= 0) { show(`${product.name} está sem preço.`, true); return }
    setDone(null)
    setCart((current) => {
      const step = product.unit === 'KG' ? 1000 : 1000
      const found = current.find((line) => line.productId === product.id)
      if (found) return current.map((line) => line.productId === product.id ? { ...line, quantityMilli: line.quantityMilli + step } : line)
      return [{ productId: product.id, quantityMilli: step }, ...current]
    })
    show(`+1 ${product.name}`)
  }

  function onCode(code: string) {
    if (paying || unknownCode) return
    const product = findByBarcode(state, code)
    if (product) add(product)
    else setUnknownCode(code)
  }

  function change(productId: string, delta: number) {
    setCart((current) => current
      .map((line) => line.productId === productId ? { ...line, quantityMilli: line.quantityMilli + delta * 1000 } : line)
      .filter((line) => line.quantityMilli > 0))
  }

  async function finish() {
    try {
      const sale = await commit((current) => {
        const result = applySale(current, cart, method)
        return { state: result.state, result: result.sale }
      })
      const items = cart.map((line) => {
        const product = byId.get(line.productId)
        return { name: product?.name || 'Produto', quantity: qty(line.quantityMilli, product?.unit) }
      })
      void notifyWhatsApp({ kind: 'sale', items, totalCents: sale.totalCents, paymentMethod: method }, { keepOpen: true })
      setSession((current) => ({ count: current.count + 1, totalCents: current.totalCents + sale.totalCents }))
      setDone({ totalCents: sale.totalCents })
      setCart([])
      setPaying(false)
      setMethod('pix')
    } catch (cause) {
      show(cause instanceof Error ? cause.message : 'Não consegui concluir a venda.', true)
    }
  }

  async function closeRegister() {
    await notifyWhatsApp({ kind: 'caixa', salesCount: session.count, totalCents: session.totalCents }, { keepOpen: false })
    setClosed(true)
  }

  if (closed) {
    return (
      <Shell title="Caixa" status="ready">
        <div className={styles.center}>
          <div className={styles.bigIcon}><CheckCircle2 size={36} /></div>
          <div className={styles.bigTitle}>Caixa fechado</div>
          <div className={styles.bigText}>{session.count} venda(s) · {money(session.totalCents)}. Te mandei o resumo no WhatsApp.</div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell
      title="Caixa"
      subtitle={session.count ? `${session.count} venda(s) hoje aqui · ${money(session.totalCents)}` : 'Leia os produtos com a câmera'}
      status={status}
      action={<button className={styles.topBtn} onClick={closeRegister}>Fechar caixa</button>}
    >
      <Toast message={toast.message} error={toast.error} />
      <ContinuousScanner onCode={onCode} paused={paying || Boolean(unknownCode)} compact={cart.length > 3} />

      <div className={styles.wrap}>
        {done && !cart.length && (
          <div className={styles.card} style={{ textAlign: 'center', marginBottom: 12 }}>
            <div className={styles.row} style={{ justifyContent: 'center', color: 'var(--brand)', fontWeight: 800 }}>
              <CheckCircle2 size={20} /> Venda de {money(done.totalCents)} registrada
            </div>
            <div className={styles.meta}>Já te mandei no WhatsApp. Pode ler o próximo cliente.</div>
          </div>
        )}

        <div className={styles.search}>
          <Search size={18} color="var(--muted)" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Sem código? Busque pelo nome" />
        </div>
        {results.length > 0 && (
          <div className={styles.list} style={{ marginTop: 8 }}>
            {results.map((product) => (
              <button key={product.id} className={styles.item} onClick={() => { add(product); setQuery('') }}>
                <div className={styles.grow}>
                  <div className={styles.name}>{product.name}</div>
                  <div className={styles.meta}>{qty(product.stockMilli, product.unit)} em estoque</div>
                </div>
                <div className={styles.price}>{money(product.priceCents)}</div>
              </button>
            ))}
          </div>
        )}

        <div className={styles.label}>Carrinho</div>
        {!cart.length ? (
          <div className={styles.empty}>Nenhum item ainda. Aponte a câmera para o código.</div>
        ) : (
          <div className={styles.list}>
            {cart.map((line) => {
              const product = byId.get(line.productId)
              if (!product) return null
              const short = product.stockMilli < line.quantityMilli
              return (
                <div key={line.productId} className={styles.item}>
                  <div className={styles.grow}>
                    <div className={styles.name}>{product.name}</div>
                    <div className={styles.meta}>
                      {money(product.priceCents)} {short ? `· estoque registrado: ${qty(Math.max(0, product.stockMilli), product.unit)} (vende mesmo assim)` : ''}
                    </div>
                  </div>
                  <div className={styles.stepper}>
                    <button onClick={() => change(product.id, -1)} aria-label="Menos">{line.quantityMilli <= 1000 ? <Trash2 size={16} /> : '−'}</button>
                    <span>{line.quantityMilli / 1000}</span>
                    <button onClick={() => change(product.id, 1)} aria-label="Mais">+</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className={styles.dock}>
          <div className={styles.dockInner}>
            <div className={styles.total}>
              <span className={styles.totalLabel}>{itemCount.toLocaleString('pt-BR')} item(ns)</span>
              <span className={styles.totalValue}>{money(totalCents)}</span>
            </div>
            <button className={styles.btn} onClick={() => setPaying(true)}>Cobrar {money(totalCents)}</button>
          </div>
        </div>
      )}

      {paying && (
        <div className={styles.backdrop} onClick={() => !saving && setPaying(false)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.grab} />
            <div className={styles.total}>
              <span className={styles.totalLabel}>Total</span>
              <span className={styles.totalValue}>{money(totalCents)}</span>
            </div>
            <div className={styles.pay}>
              {PAYMENTS.map(({ id, label, icon: Icon }) => (
                <button key={id} className={`${styles.payBtn} ${method === id ? styles.payOn : ''}`} onClick={() => setMethod(id)}>
                  <Icon size={24} />{label}
                </button>
              ))}
            </div>
            <button className={styles.btn} disabled={saving} onClick={finish}>{saving ? 'Registrando…' : 'Confirmar venda'}</button>
            <button className={styles.linkBtn} style={{ width: '100%', marginTop: 8 }} onClick={() => setPaying(false)} disabled={saving}>Voltar</button>
          </div>
        </div>
      )}

      {unknownCode && (
        <ProductSheet
          barcode={unknownCode}
          product={null}
          saving={saving}
          title="Produto não cadastrado"
          onClose={() => setUnknownCode(null)}
          onSave={async (fields) => {
            const product = await commit((current) => {
              const result = registerProduct(current, unknownCode, fields)
              return { state: result.state, result: result.product }
            })
            setUnknownCode(null)
            if (product.stockMilli > 0) add(product)
            else show('Cadastrado. Ele está sem estoque, então não entrou na venda.', true)
          }}
        />
      )}
    </Shell>
  )
}
