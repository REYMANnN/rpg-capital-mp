'use client'

import { useMemo, useState } from 'react'
import { Package, Search, X } from 'lucide-react'
import ProductSheet from '../ProductSheet'
import Shell, { Toast } from '../Shell'
import {
  activeProducts, editProduct, money, normalize, qty, stockBadge, useToast, useWaStore,
} from '../shared'
import styles from '../r.module.css'

type Filter = 'todos' | 'acabando' | 'zerados'

// Prateleira: todos os produtos da loja, com busca e filtros. Toque abre o perfil editável.
export default function PrateleiraPage() {
  const { state, status, saving, commit } = useWaStore()
  const { toast, show } = useToast()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')
  const [openId, setOpenId] = useState<string | null>(null)

  const products = useMemo(() => activeProducts(state).slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [state])
  const counts = useMemo(() => ({
    acabando: products.filter((p) => stockBadge(p) === 'low').length,
    zerados: products.filter((p) => stockBadge(p) === 'out').length,
    valor: products.reduce((sum, p) => sum + Math.max(0, p.stockMilli) * (p.averageCostCents || 0) / 1000, 0),
  }), [products])

  const visible = useMemo(() => {
    const words = normalize(query.trim()).split(/\s+/).filter(Boolean)
    return products.filter((p) => {
      if (filter === 'acabando' && stockBadge(p) !== 'low') return false
      if (filter === 'zerados' && stockBadge(p) !== 'out') return false
      if (!words.length) return true
      const hay = `${normalize(p.name)} ${p.barcode} ${normalize(String(p.catalogBrand || ''))}`
      return words.every((word) => hay.includes(word))
    })
  }, [products, query, filter])

  const open = openId ? products.find((p) => p.id === openId) || null : null

  return (
    <Shell title="Prateleira" subtitle={`${products.length} produtos`} status={status}>
      <Toast message={toast.message} error={toast.error} />
      <div className={styles.wrap}>
        <div className={styles.stats}>
          <div className={styles.stat}><div className={styles.statValue}>{products.length}</div><div className={styles.statLabel}>Produtos</div></div>
          <button className={styles.stat} style={{ textAlign: 'left' }} onClick={() => setFilter('acabando')}>
            <div className={styles.statValue} style={{ color: counts.acabando ? 'var(--warn)' : undefined }}>{counts.acabando}</div>
            <div className={styles.statLabel}>Acabando</div>
          </button>
          <div className={styles.stat}><div className={styles.statValue}>{money(Math.round(counts.valor))}</div><div className={styles.statLabel}>Em estoque (custo)</div></div>
        </div>

        <div className={styles.search} style={{ marginTop: 12, position: 'sticky', top: 'calc(60px + env(safe-area-inset-top))', zIndex: 5 }}>
          <Search size={18} color="var(--muted)" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome, marca ou código" />
          {query && <button className={styles.linkBtn} onClick={() => setQuery('')} aria-label="Limpar"><X size={18} /></button>}
        </div>
        <div className={styles.chips}>
          {([['todos', 'Todos'], ['acabando', `Acabando (${counts.acabando})`], ['zerados', `Zerados (${counts.zerados})`]] as const).map(([id, label]) => (
            <button key={id} className={`${styles.chip} ${filter === id ? styles.chipOn : ''}`} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>

        <div className={styles.list} style={{ marginTop: 12 }}>
          {!visible.length && <div className={styles.empty}>Nada encontrado.</div>}
          {visible.map((p) => {
            const badge = stockBadge(p)
            return (
              <button key={p.id} className={styles.item} onClick={() => setOpenId(p.id)}>
                {p.catalogImageUrl ? <img className={styles.thumb} src={p.catalogImageUrl} alt="" loading="lazy" /> : <div className={styles.thumb}><Package size={20} /></div>}
                <div className={styles.grow}>
                  <div className={styles.name}>{p.name}</div>
                  <div className={styles.meta}>
                    <span className={`${styles.badge} ${badge === 'out' ? styles.badgeOut : badge === 'low' ? styles.badgeLow : styles.badgeOk}`}>
                      {qty(p.stockMilli, p.unit)}
                    </span>
                  </div>
                </div>
                <div className={styles.price}>{money(p.priceCents)}</div>
              </button>
            )
          })}
        </div>
      </div>

      {open && (
        <ProductSheet
          key={open.id}
          barcode={open.barcode}
          product={open}
          saving={saving}
          onClose={() => setOpenId(null)}
          onSave={async (fields) => {
            await commit((current) => ({ state: editProduct(current, open.id, fields), result: null }))
            show('Salvo.')
            setOpenId(null)
          }}
        />
      )}
    </Shell>
  )
}
