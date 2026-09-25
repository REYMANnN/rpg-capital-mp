'use client'

import { useState } from 'react'
import { FileText, Package } from 'lucide-react'
import ContinuousScanner from '../ContinuousScanner'
import ProductSheet from '../ProductSheet'
import Shell, { Toast } from '../Shell'
import {
  addEntry, centsToInput, findByBarcode, money, notifyWhatsApp, parseMoney, parseQty, qty, registerProduct,
  useToast, useWaStore, type WaProduct,
} from '../shared'
import styles from '../r.module.css'

type Done = { name: string; quantityMilli: number; unit?: 'UN' | 'KG'; costCents: number }

// Subir estoque: lê o código, diz quantas chegaram e quanto custou cada. Repete até acabar.
export default function EntradaPage() {
  const { state, status, saving, commit } = useWaStore()
  const { toast, show } = useToast()
  const [code, setCode] = useState<string | null>(null)
  const [amount, setAmount] = useState('1')
  const [cost, setCost] = useState('')
  const [done, setDone] = useState<Done[]>([])
  const [finished, setFinished] = useState(false)
  const [invoice, setInvoice] = useState(false)

  const product = code ? findByBarcode(state, code) : null

  function onCode(scanned: string) {
    if (code) return
    if (/^\d{44}$/.test(scanned)) { setInvoice(true); return }
    const found = findByBarcode(state, scanned)
    setAmount('1')
    setCost(found ? centsToInput(found.averageCostCents || 0) : '')
    setCode(scanned)
  }

  async function confirm(p: WaProduct) {
    const quantityMilli = parseQty(amount)
    const unitCostCents = cost.trim() ? parseMoney(cost) : p.averageCostCents || 0
    if (!Number.isFinite(quantityMilli) || quantityMilli <= 0) return show('Quantidade inválida.', true)
    if (!Number.isFinite(unitCostCents) || unitCostCents < 0) return show('Custo inválido.', true)
    try {
      await commit((current) => ({ state: addEntry(current, p.id, quantityMilli, unitCostCents), result: null }))
      setDone((current) => [{ name: p.name, quantityMilli, unit: p.unit, costCents: Math.round(unitCostCents * quantityMilli / 1000) }, ...current])
      show(`+${qty(quantityMilli, p.unit)} ${p.name}`)
      setCode(null)
    } catch (cause) {
      show(cause instanceof Error ? cause.message : 'Não consegui salvar.', true)
    }
  }

  async function finish() {
    await notifyWhatsApp({
      kind: 'entrada',
      items: done.map((d) => ({ name: d.name, quantity: qty(d.quantityMilli, d.unit) })),
      totalCostCents: done.reduce((sum, d) => sum + d.costCents, 0),
    }, { keepOpen: false })
    setFinished(true)
  }

  const totalCost = done.reduce((sum, d) => sum + d.costCents, 0)

  if (finished) {
    return (
      <Shell title="Subir estoque" status="ready">
        <div className={styles.center}>
          <div className={styles.bigIcon}><Package size={34} /></div>
          <div className={styles.bigTitle}>Estoque atualizado</div>
          <div className={styles.bigText}>{done.length} entrada(s) · {money(totalCost)}. Te mandei o resumo no WhatsApp.</div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell title="Subir estoque" subtitle="Leia o código do que chegou" status={status}
      action={<a className={styles.topBtn} href="/inventory-v1?wa_flow=entrada" style={{ textDecoration: 'none' }}><FileText size={15} /> Nota fiscal</a>}>
      <Toast message={toast.message} error={toast.error} />
      <ContinuousScanner onCode={onCode} paused={Boolean(code) || invoice} />
      <div className={styles.wrap}>
        {invoice && (
          <div className={styles.card} style={{ marginBottom: 12 }}>
            <div className={styles.name}>Isso é uma nota fiscal</div>
            <div className={styles.meta}>Para dar entrada em todos os itens da nota de uma vez, use o leitor de nota.</div>
            <div className={styles.btnRow} style={{ marginTop: 10 }}>
              <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setInvoice(false)}>Voltar</button>
              <a className={styles.btn} style={{ textDecoration: 'none' }} href="/inventory-v1?wa_flow=entrada">Abrir leitor</a>
            </div>
          </div>
        )}
        <div className={styles.label}>Entradas agora</div>
        {!done.length ? (
          <div className={styles.empty}>Leia o código de cada produto que chegou. Você diz quantos e quanto pagou.</div>
        ) : (
          <div className={styles.list}>
            {done.map((d, index) => (
              <div key={index} className={styles.item}>
                <div className={styles.grow}>
                  <div className={styles.name}>{d.name}</div>
                  <div className={styles.meta}>+{qty(d.quantityMilli, d.unit)}</div>
                </div>
                <div className={styles.price}>{money(d.costCents)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {done.length > 0 && !code && (
        <div className={styles.dock}>
          <div className={styles.dockInner}>
            <div className={styles.total}>
              <span className={styles.totalLabel}>{done.length} entrada(s)</span>
              <span className={styles.totalValue}>{money(totalCost)}</span>
            </div>
            <button className={styles.btn} onClick={finish}>Concluir entrada</button>
          </div>
        </div>
      )}

      {code && product && (
        <div className={styles.backdrop} onClick={() => setCode(null)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.grab} />
            <div className={styles.sheetHead}>
              {product.catalogImageUrl ? <img className={styles.sheetImg} src={product.catalogImageUrl} alt="" /> : <div className={styles.sheetImg}><Package /></div>}
              <div className={styles.grow}>
                <div className={styles.sheetTitle}>{product.name}</div>
                <div className={styles.meta}>Tem {qty(product.stockMilli, product.unit)} · vende a {money(product.priceCents)}</div>
              </div>
            </div>
            <div className={styles.grid2}>
              <label className={styles.field}>
                <span>Quantas chegaram</span>
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
              </label>
              <label className={styles.field}>
                <span>Custo de cada (R$)</span>
                <input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" />
              </label>
            </div>
            <div className={styles.note}>Fica com {qty(product.stockMilli + (Number.isFinite(parseQty(amount)) ? parseQty(amount) : 0), product.unit)} depois da entrada.</div>
            <div style={{ marginTop: 14 }}>
              <button className={styles.btn} disabled={saving} onClick={() => confirm(product)}>{saving ? 'Salvando…' : 'Dar entrada'}</button>
            </div>
          </div>
        </div>
      )}

      {code && !product && (
        <ProductSheet
          barcode={code}
          product={null}
          saving={saving}
          title="Produto novo"
          onClose={() => setCode(null)}
          onSave={async (fields) => {
            const created = await commit((current) => {
              const result = registerProduct(current, code, fields)
              return { state: result.state, result: result.product }
            })
            if (created.stockMilli > 0) {
              setDone((current) => [{ name: created.name, quantityMilli: created.stockMilli, unit: created.unit, costCents: Math.round((created.averageCostCents || 0) * created.stockMilli / 1000) }, ...current])
            }
            show('Produto cadastrado.')
            setCode(null)
          }}
        />
      )}
    </Shell>
  )
}
