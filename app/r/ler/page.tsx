'use client'

import { useState } from 'react'
import { History } from 'lucide-react'
import ContinuousScanner from '../ContinuousScanner'
import ProductSheet from '../ProductSheet'
import Shell, { Toast } from '../Shell'
import {
  editProduct, findByBarcode, money, notifyWhatsApp, qty, registerProduct, useToast, useWaStore, type WaProduct,
} from '../shared'
import styles from '../r.module.css'

// Ler código: aponta a câmera, abre o perfil do produto e deixa editar na hora.
export default function LerPage() {
  const { state, status, saving, commit } = useWaStore()
  const { toast, show } = useToast()
  const [code, setCode] = useState<string | null>(null)
  const [recent, setRecent] = useState<string[]>([])

  const product = code ? findByBarcode(state, code) : null

  function onCode(scanned: string) {
    if (code) return
    setCode(scanned)
    const found = findByBarcode(state, scanned)
    if (found) void notifyWhatsApp(summary(found), { keepOpen: true })
    setRecent((current) => [scanned, ...current.filter((c) => c !== scanned)].slice(0, 6))
  }

  function summary(p: WaProduct) {
    return { kind: 'product' as const, name: p.name, priceCents: p.priceCents, costCents: p.averageCostCents || 0, stock: qty(p.stockMilli, p.unit) }
  }

  return (
    <Shell title="Ler código" subtitle="Aponte para o código e veja o produto" status={status}>
      <Toast message={toast.message} error={toast.error} />
      <ContinuousScanner onCode={onCode} paused={Boolean(code)} />
      <div className={styles.wrap}>
        <div className={styles.label}>Lidos agora</div>
        {!recent.length ? (
          <div className={styles.empty}>Leia um código para ver preço, custo, margem e estoque. Dá para editar tudo.</div>
        ) : (
          <div className={styles.list}>
            {recent.map((c) => {
              const p = findByBarcode(state, c)
              return (
                <button key={c} className={styles.item} onClick={() => setCode(c)}>
                  <History size={18} color="var(--muted)" />
                  <div className={styles.grow}>
                    <div className={styles.name}>{p ? p.name : 'Não cadastrado'}</div>
                    <div className={styles.code}>{c}</div>
                  </div>
                  {p && <div className={styles.price}>{money(p.priceCents)}</div>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {code && (
        <ProductSheet
          key={`${code}-${product?.id || 'new'}`}
          barcode={code}
          product={product}
          saving={saving}
          onClose={() => setCode(null)}
          onSave={async (fields) => {
            if (product) {
              const saved = await commit((current) => {
                const next = editProduct(current, product.id, fields)
                return { state: next, result: next.products.find((p) => p.id === product.id)! }
              })
              show('Salvo.')
              void notifyWhatsApp(summary(saved), { keepOpen: true })
            } else {
              const saved = await commit((current) => {
                const result = registerProduct(current, code, fields)
                return { state: result.state, result: result.product }
              })
              show('Produto cadastrado.')
              void notifyWhatsApp(summary(saved), { keepOpen: true })
            }
            setCode(null)
          }}
        />
      )}
    </Shell>
  )
}
