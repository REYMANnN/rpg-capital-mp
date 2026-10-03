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
  const [pixCharge, setPixCharge] = useState<{ amountCents: number; payload: string; qrDataUrl: string } | null>(null)
  const [pixBusy, setPixBusy] = useState(false)
  const [pixError, setPixError] = useState('')
  const [copied, setCopied] = useState(false)
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

  async function chargePix() {
    if (!cart.length || totalCents <= 0 || pixBusy || saving) return
    setPixBusy(true)
    setPixError('')
    setCopied(false)
    try {
      const response = await fetch('/api/balcao/checkout/pix', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountCents: totalCents }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error || 'Não foi possível gerar a cobrança Pix.')
      if (
        !Number.isInteger(result?.amountCents)
        || typeof result?.payload !== 'string'
        || typeof result?.qrDataUrl !== 'string'
      ) {
        throw new Error('O servidor não retornou uma cobrança Pix válida.')
      }
      setPixCharge({
        amountCents: result.amountCents,
        payload: result.payload,
        qrDataUrl: result.qrDataUrl,
      })
    } catch (cause) {
      setPixError(cause instanceof Error ? cause.message : 'Não foi possível gerar a cobrança Pix.')
    } finally {
      setPixBusy(false)
    }
  }

  async function copyPix() {
    if (!pixCharge) return
    try {
      await navigator.clipboard.writeText(pixCharge.payload)
      setCopied(true)
    } catch {
      setPixError('Não foi possível copiar automaticamente. Selecione o código abaixo.')
    }
  }

  function closePayment() {
    if (saving || pixBusy) return
    setPaying(false)
    setPixCharge(null)
    setPixError('')
    setCopied(false)
  }

  async function finish() {
    if (method === 'pix' && !pixCharge) {
      show('Gere o QR Code Pix antes de concluir a venda.', true)
      return
    }
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
      setPixCharge(null)
      setPixError('')
      setCopied(false)
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
        <div className={styles.backdrop} onClick={closePayment}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.grab} />
            <div className={styles.total}>
              <span className={styles.totalLabel}>{pixCharge ? 'Cobrança Pix' : 'Total'}</span>
              <span className={styles.totalValue}>{money(pixCharge?.amountCents ?? totalCents)}</span>
            </div>

            {pixCharge ? (
              <>
                <div style={{ display: 'grid', placeItems: 'center', margin: '18px 0' }}>
                  <img
                    src={pixCharge.qrDataUrl}
                    alt={`QR Code Pix de ${money(pixCharge.amountCents)}`}
                    style={{ width: 'min(320px, 100%)', height: 'auto', borderRadius: 12, background: 'white' }}
                  />
                </div>
                <div className={styles.meta} style={{ marginBottom: 8 }}>Pix Copia e Cola</div>
                <textarea
                  readOnly
                  value={pixCharge.payload}
                  onFocus={(event) => event.currentTarget.select()}
                  style={{ width: '100%', minHeight: 88, boxSizing: 'border-box', resize: 'vertical', border: '1px solid var(--line)', borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 1.4 }}
                />
                {pixError && <div className={styles.meta} style={{ marginTop: 8 }}>{pixError}</div>}
                <button className={styles.linkBtn} style={{ width: '100%', marginTop: 10 }} onClick={() => void copyPix()} disabled={saving}>
                  {copied ? 'Código copiado' : 'Copiar código Pix'}
                </button>
                <button className={styles.btn} style={{ marginTop: 8 }} disabled={saving} onClick={() => void finish()}>
                  {saving ? 'Registrando…' : 'Pagamento recebido'}
                </button>
                <button className={styles.linkBtn} style={{ width: '100%', marginTop: 8 }} onClick={closePayment} disabled={saving}>Cancelar</button>
              </>
            ) : (
              <>
                <div className={styles.pay}>
                  {PAYMENTS.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      className={`${styles.payBtn} ${method === id ? styles.payOn : ''}`}
                      disabled={pixBusy || saving}
                      onClick={() => {
                        setMethod(id)
                        setPixError('')
                        if (id === 'pix') void chargePix()
                      }}
                    >
                      <Icon size={24} />{label}
                    </button>
                  ))}
                </div>
                {pixError && <div className={styles.meta} style={{ marginBottom: 8 }}>{pixError}</div>}
                <button
                  className={styles.btn}
                  disabled={saving || pixBusy}
                  onClick={() => method === 'pix' ? void chargePix() : void finish()}
                >
                  {pixBusy ? 'Gerando QR Pix…' : saving ? 'Registrando…' : method === 'pix' ? 'Gerar QR Pix' : 'Confirmar venda'}
                </button>
                <button className={styles.linkBtn} style={{ width: '100%', marginTop: 8 }} onClick={closePayment} disabled={saving || pixBusy}>Voltar</button>
              </>
            )}
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
