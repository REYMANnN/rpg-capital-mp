'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { completeSale, type PaymentMethod } from '@/lib/inventory/core'
import { calculatePurchaseUpdate } from '@/lib/inventory/intake'
import type { WhatsAppFlowSummary } from '@/lib/whatsapp-flow'

// Ferramentas web da Rafa (/r/*): páginas curtas, abertas pelo link do WhatsApp.
// Leem e gravam o estado da loja em /api/inventory/state com a sessão criada pelo link.

export type Unit = 'UN' | 'KG'

export type WaProduct = {
  id: string
  barcode: string
  name: string
  unit?: Unit
  priceCents: number
  averageCostCents?: number
  stockMilli: number
  minStockMilli: number
  catalogSource?: string
  catalogBrand?: string
  catalogImageUrl?: string
  scaleCode?: string
  deletedAt?: string
  [key: string]: unknown
}

export type WaMovement = {
  id: string
  productId: string
  type: 'initial' | 'purchase' | 'sale' | 'adjustment'
  quantityMilli: number
  createdAt: string
  note: string
  origem?: string
  [key: string]: unknown
}

export type WaState = {
  products: WaProduct[]
  sales: Array<Record<string, unknown>>
  movements: WaMovement[]
  scaleRule?: unknown
  [key: string]: unknown
}

export type WaSummary = WhatsAppFlowSummary

export const money = (cents: number) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const qty = (milli: number, unit: Unit = 'UN') => `${(milli / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${unit === 'KG' ? 'kg' : 'un.'}`
export const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)

export function parseMoney(text: string) {
  const clean = text.replace(/[^\d,.-]/g, '')
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  const value = Number(normalized)
  return Number.isFinite(value) ? Math.round(value * 100) : NaN
}

export function parseQty(text: string) {
  const value = Number(text.replace(',', '.'))
  return Number.isFinite(value) ? Math.round(value * 1000) : NaN
}

export function normalize(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function activeProducts(state: WaState | null) {
  return (state?.products || []).filter((product) => !product.deletedAt)
}

type LoadStatus = 'loading' | 'ready' | 'ended' | 'error'

class SessionEnded extends Error {}

async function fetchState(): Promise<WaState> {
  const response = await fetch('/api/inventory/state', { cache: 'no-store' })
  const result = await response.json().catch(() => null)
  if (result?.error === 'wa_session_ended' || response.status === 401) throw new SessionEnded('ended')
  if (!response.ok || !result?.ok) throw new Error('load_failed')
  return result.found && result.state
    ? { ...result.state, products: result.state.products || [], sales: result.state.sales || [], movements: result.state.movements || [] }
    : { products: [], sales: [], movements: [] }
}

export function useWaStore() {
  const [state, setState] = useState<WaState | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)

  useEffect(() => {
    let cancelled = false
    fetchState()
      .then((loaded) => { if (!cancelled) { setState(loaded); setStatus('ready') } })
      .catch((error) => { if (!cancelled) setStatus(error instanceof SessionEnded ? 'ended' : 'error') })
    return () => { cancelled = true }
  }, [])

  // Busca o estado mais novo, aplica a mudança e grava (evita apagar algo que a Rafa mudou pelo zap).
  const commit = useCallback(async <T,>(mutate: (current: WaState) => { state: WaState; result: T }): Promise<T> => {
    if (busy.current) throw new Error('Aguarde, salvando…')
    busy.current = true
    setSaving(true)
    try {
      const latest = await fetchState()
      const { state: next, result } = mutate(latest)
      const response = await fetch('/api/inventory/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      const body = await response.json().catch(() => null)
      if (body?.error === 'wa_session_ended') throw new SessionEnded('ended')
      if (!response.ok || !body?.ok) throw new Error('Não consegui salvar. Tente de novo.')
      setState(next)
      return result
    } catch (error) {
      if (error instanceof SessionEnded) setStatus('ended')
      throw error
    } finally {
      busy.current = false
      setSaving(false)
    }
  }, [])

  return { state, status, saving, commit }
}

// Avisa no WhatsApp. keepOpen=true mantém o link valendo; false encerra (o link para de funcionar).
export async function notifyWhatsApp(summary: WaSummary | undefined, options: { keepOpen: boolean; cancelled?: boolean }) {
  try {
    await fetch('/api/whatsapp/flow/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: options.cancelled ? 'cancelled' : 'success', ...(summary ? { summary } : {}), ...(options.keepOpen ? { keepOpen: true } : {}) }),
    })
  } catch {}
}

export async function lookupCatalog(barcode: string): Promise<{ name: string; brand: string; imageUrl: string } | null> {
  try {
    const response = await fetch(`/api/products/lookup?barcode=${encodeURIComponent(barcode)}`, { cache: 'no-store' })
    const result = await response.json().catch(() => null)
    if (!result?.found || !result.product) return null
    return { name: String(result.product.name || ''), brand: String(result.product.brand || ''), imageUrl: String(result.product.imageUrl || '') }
  } catch {
    return null
  }
}

export const RAFA_WHATSAPP = 'https://wa.me/5511936201445'

const nowIso = () => new Date().toISOString()

export type ProductFields = {
  name: string
  unit: Unit
  priceCents: number
  averageCostCents: number
  stockMilli: number
  minStockMilli: number
  catalogBrand?: string
  catalogImageUrl?: string
  catalogSource?: string
}

export function findByBarcode(state: WaState | null, code: string) {
  return activeProducts(state).find((product) => product.barcode === code || product.scaleCode === code) || null
}

export function editProduct(state: WaState, productId: string, fields: Omit<ProductFields, 'name' | 'unit'> & { name?: string }): WaState {
  const existing = state.products.find((product) => product.id === productId)
  if (!existing) throw new Error('Produto não encontrado.')
  const delta = fields.stockMilli - existing.stockMilli
  return {
    ...state,
    products: state.products.map((product) => product.id === productId
      ? { ...product, ...(fields.name ? { name: fields.name } : {}), priceCents: fields.priceCents, averageCostCents: fields.averageCostCents, stockMilli: fields.stockMilli, minStockMilli: fields.minStockMilli }
      : product),
    movements: delta
      ? [...state.movements, { id: uid(), productId, type: 'adjustment', quantityMilli: delta, createdAt: nowIso(), note: 'Ajuste pelo WhatsApp (ler código)', origem: 'whatsapp' }]
      : state.movements,
  }
}

export function registerProduct(state: WaState, barcode: string, fields: ProductFields): { state: WaState; product: WaProduct } {
  if (findByBarcode(state, barcode)) throw new Error('Esse código já está cadastrado.')
  const product: WaProduct = {
    id: uid(),
    barcode,
    name: fields.name,
    unit: fields.unit,
    priceCents: fields.priceCents,
    averageCostCents: fields.averageCostCents,
    stockMilli: fields.stockMilli,
    minStockMilli: fields.minStockMilli,
    ...(fields.catalogSource ? { catalogSource: fields.catalogSource } : {}),
    ...(fields.catalogBrand ? { catalogBrand: fields.catalogBrand } : {}),
    ...(fields.catalogImageUrl ? { catalogImageUrl: fields.catalogImageUrl } : {}),
  }
  return {
    product,
    state: {
      ...state,
      products: [...state.products, product],
      movements: fields.stockMilli
        ? [...state.movements, { id: uid(), productId: product.id, type: 'initial', quantityMilli: fields.stockMilli, createdAt: nowIso(), note: 'Cadastro pelo WhatsApp', origem: 'whatsapp' }]
        : state.movements,
    },
  }
}

export function addEntry(state: WaState, productId: string, quantityMilli: number, unitCostCents: number): WaState {
  const product = state.products.find((candidate) => candidate.id === productId)
  if (!product) throw new Error('Produto não encontrado.')
  const update = calculatePurchaseUpdate(product.stockMilli, product.averageCostCents || 0, quantityMilli, unitCostCents)
  return {
    ...state,
    products: state.products.map((candidate) => candidate.id === productId ? { ...candidate, ...update } : candidate),
    movements: [...state.movements, { id: uid(), productId, type: 'purchase', quantityMilli, createdAt: nowIso(), note: 'Entrada pelo WhatsApp', origem: 'whatsapp' }],
  }
}

export function applySale(state: WaState, lines: Array<{ productId: string; quantityMilli: number }>, method: PaymentMethod) {
  const result = completeSale(state.products as never, lines, uid(), { method, confirmedAt: nowIso() })
  const byId = new Map(result.products.map((product) => [product.id, product.stockMilli]))
  const sale = { ...result.sale, origem: 'whatsapp' }
  const next: WaState = {
    ...state,
    products: state.products.map((product) => ({ ...product, stockMilli: byId.get(product.id) ?? product.stockMilli })),
    sales: [sale, ...state.sales],
    movements: [
      ...state.movements,
      ...result.sale.items.map((item) => ({ id: uid(), productId: item.productId, type: 'sale' as const, quantityMilli: -item.quantityMilli, createdAt: result.sale.createdAt, note: `Venda ${result.sale.id.slice(0, 8)}`, origem: 'whatsapp' })),
    ],
  }
  return { state: next, sale: result.sale }
}

// Aviso curto no topo da tela.
export function useToast() {
  const [toast, setToast] = useState<{ message: string; error: boolean }>({ message: '', error: false })
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((message: string, error = false) => {
    setToast({ message, error })
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast({ message: '', error: false }), error ? 3500 : 2200)
  }, [])
  return { toast, show }
}

export function stockBadge(product: WaProduct): 'ok' | 'low' | 'out' {
  if (product.stockMilli <= 0) return 'out'
  if (product.minStockMilli > 0 && product.stockMilli <= product.minStockMilli) return 'low'
  return 'ok'
}

export const centsToInput = (cents: number) => (Number(cents || 0) / 100).toFixed(2).replace('.', ',')
export const milliToInput = (milli: number) => String(Number(milli || 0) / 1000).replace('.', ',')
