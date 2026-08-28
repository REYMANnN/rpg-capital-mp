'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Barcode,
  Boxes,
  Camera,
  Check,
  ChevronRight,
  Cloud,
  CloudOff,
  FileUp,
  Pencil,
  RotateCcw,
  ScanLine,
  Settings,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react'
import { completeSale, type Product, type Sale, type ScaleRule } from '@/lib/inventory/core'
import { calculatePurchaseUpdate } from '@/lib/inventory/intake'
import { parseNfeXml, type ParsedNfe, type ParsedNfeItem } from '@/lib/inventory/nfe'
import { validateNewProductCommercialData, validateSalePrice } from '@/lib/inventory/productRules'
import { INVENTORY_APP_VERSION } from '@/lib/inventory/version'
import QuaggaScanner from './QuaggaScanner'
import styles from './inventory.module.css'

type Unit = 'UN' | 'KG'
type AppProduct = Product & {
  unit: Unit
  averageCostCents: number
  catalogSource?: string
  catalogBrand?: string
  catalogImageUrl?: string
}
type Movement = {
  id: string
  productId: string
  type: 'initial' | 'purchase' | 'sale' | 'adjustment'
  quantityMilli: number
  createdAt: string
  note: string
}
type CartLine = { productId: string; quantityMilli: number; source: 'unit' }
type StoreData = { products: AppProduct[]; sales: Sale[]; movements: Movement[]; scaleRule: ScaleRule }
type LookupState =
  | { status: 'idle' }
  | { status: 'loading'; barcode: string }
  | { status: 'found'; barcode: string; source: string; brand: string }
  | { status: 'new'; barcode: string }
type CloudState = 'loading' | 'syncing' | 'synced' | 'offline'
type ProductMode = 'new' | 'edit' | null

type ProductForm = {
  barcode: string
  name: string
  unit: Unit
  price: string
  stock: string
  minStock: string
  cost: string
  catalogSource: string
  catalogBrand: string
  catalogImageUrl: string
}

type InvoiceReviewLine = ParsedNfeItem & {
  status: 'existing' | 'new' | 'pending'
  productId?: string
  name: string
  brand: string
  imageUrl: string
  source: string
}
type InvoiceReview = Omit<ParsedNfe, 'items'> & {
  items: InvoiceReviewLine[]
  imported?: boolean
}

const DEFAULT_RULE: ScaleRule = { prefix: '', productDigits: 0, valueDigits: 0, mode: 'weight', decimalPlaces: 0 }
const STORAGE_KEY = 'rpg-inventory-v1-2026'
const uid = () => crypto.randomUUID()
const money = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const qty = (m: number, u: Unit) =>
  u === 'KG'
    ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`
    : `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} un.`
const emptyData = (): StoreData => ({ products: [], sales: [], movements: [], scaleRule: DEFAULT_RULE })
const emptyForm = (): ProductForm => ({
  barcode: '',
  name: '',
  unit: 'UN',
  price: '',
  stock: '0',
  minStock: '0',
  cost: '',
  catalogSource: '',
  catalogBrand: '',
  catalogImageUrl: '',
})

function validStoreData(value: unknown): value is StoreData {
  if (!value || typeof value !== 'object') return false
  const state = value as StoreData
  return Array.isArray(state.products) && Array.isArray(state.sales) && Array.isArray(state.movements)
}

function numberInput(value: string) {
  return Number(value.replace(/\./g, '').replace(',', '.'))
}

function toCents(value: string) {
  const parsed = numberInput(value || '0')
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN
}

function toMilli(value: string) {
  const parsed = numberInput(value || '0')
  return Number.isFinite(parsed) ? Math.round(parsed * 1000) : Number.NaN
}

function centsInput(value: number) {
  return value > 0 ? (value / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
}

function quantityInput(value: number) {
  return (value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

function invoiceMarker(invoice: Pick<ParsedNfe, 'accessKey' | 'number' | 'supplierDocument' | 'issuedAt'>) {
  return `NF-e:${invoice.accessKey || `${invoice.supplierDocument}:${invoice.number}:${invoice.issuedAt}`}`
}

async function pushCloudState(state: StoreData) {
  const response = await fetch('/api/inventory/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })
  if (!response.ok) throw new Error('cloud_sync_failed')
}

export default function InventoryV1() {
  const [data, setData] = useState<StoreData>(emptyData)
  const [loaded, setLoaded] = useState(false)
  const [cloud, setCloud] = useState<CloudState>('loading')
  const [tab, setTab] = useState<'stock' | 'intake' | 'checkout' | 'settings'>('stock')
  const [cart, setCart] = useState<CartLine[]>([])
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanTarget, setScanTarget] = useState<'product' | 'checkout'>('checkout')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' })
  const [productMode, setProductMode] = useState<ProductMode>(null)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [productForm, setProductForm] = useState<ProductForm>(emptyForm)
  const [invoiceReview, setInvoiceReview] = useState<InvoiceReview | null>(null)
  const [invoiceLoading, setInvoiceLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      let local = emptyData()
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (validStoreData(parsed)) local = { ...parsed, scaleRule: parsed.scaleRule || DEFAULT_RULE }
        }
      } catch {}

      try {
        const response = await fetch('/api/inventory/state', { cache: 'no-store' })
        const result = await response.json()
        if (cancelled) return
        if (response.ok && result?.ok && result?.found && validStoreData(result.state)) {
          const remote = { ...result.state, scaleRule: result.state.scaleRule || DEFAULT_RULE }
          setData(remote)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remote))
          setCloud('synced')
        } else {
          setData(local)
          setCloud('synced')
          if (local.products.length || local.sales.length || local.movements.length) {
            try {
              await pushCloudState(local)
            } catch {
              if (!cancelled) setCloud('offline')
            }
          }
        }
      } catch {
        if (cancelled) return
        setData(local)
        setCloud('offline')
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    const timer = window.setTimeout(async () => {
      setCloud('syncing')
      try {
        await pushCloudState(data)
        setCloud('synced')
      } catch {
        setCloud('offline')
      }
    }, 350)
    return () => window.clearTimeout(timer)
  }, [data, loaded])

  const totalCents = useMemo(
    () =>
      cart.reduce((sum, line) => {
        const p = data.products.find((x) => x.id === line.productId)
        return sum + (p ? Math.round((p.priceCents * line.quantityMilli) / 1000) : 0)
      }, 0),
    [cart, data.products],
  )

  const pendingPriceCount = useMemo(() => data.products.filter((p) => p.priceCents <= 0).length, [data.products])

  function flash(message: string) {
    setError('')
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2800)
  }

  function fail(message: string) {
    setNotice('')
    setError(message)
  }

  function closeProductPanel() {
    setProductMode(null)
    setEditingProductId(null)
    setLookup({ status: 'idle' })
    setProductForm(emptyForm())
  }

  function editProduct(product: AppProduct) {
    setProductMode('edit')
    setEditingProductId(product.id)
    setLookup({ status: 'idle' })
    setProductForm({
      barcode: product.barcode,
      name: product.name,
      unit: product.unit,
      price: centsInput(product.priceCents),
      stock: quantityInput(product.stockMilli),
      minStock: quantityInput(product.minStockMilli),
      cost: centsInput(product.averageCostCents),
      catalogSource: product.catalogSource || '',
      catalogBrand: product.catalogBrand || '',
      catalogImageUrl: product.catalogImageUrl || '',
    })
  }

  async function prepareProduct(code: string) {
    const existing = data.products.find((p) => p.barcode === code)
    if (existing) {
      editProduct(existing)
      return 'existing' as const
    }

    setProductMode('new')
    setEditingProductId(null)
    setProductForm({ ...emptyForm(), barcode: code })
    setLookup({ status: 'loading', barcode: code })

    try {
      const response = await fetch(`/api/products/lookup?barcode=${encodeURIComponent(code)}`, { cache: 'no-store' })
      const result = await response.json()
      if (result?.found && result?.product?.name) {
        setProductForm((form) => ({
          ...form,
          barcode: code,
          name: String(result.product.name),
          catalogSource: String(result.source || ''),
          catalogBrand: String(result.product.brand || ''),
          catalogImageUrl: String(result.product.imageUrl || ''),
        }))
        setLookup({
          status: 'found',
          barcode: code,
          source: String(result.source || 'base de produtos'),
          brand: String(result.product.brand || ''),
        })
        return 'new-found' as const
      }
    } catch {}

    setLookup({ status: 'new', barcode: code })
    return 'new-manual' as const
  }

  function saveProduct() {
    const barcode = productForm.barcode.trim()
    const name = productForm.name.trim()
    const priceCents = toCents(productForm.price)
    const averageCostCents = toCents(productForm.cost)
    const stockMilli = toMilli(productForm.stock || '0')
    const minStockMilli = toMilli(productForm.minStock || '0')

    if (!barcode || !name) return fail('O produto precisa de código e nome para ser salvo.')
    if (!Number.isFinite(stockMilli) || stockMilli < 0 || !Number.isFinite(minStockMilli) || minStockMilli < 0) {
      return fail('Quantidade em estoque ou estoque mínimo inválido.')
    }

    if (productMode === 'new') {
      const commercialError = validateNewProductCommercialData(priceCents, averageCostCents)
      if (commercialError) return fail(commercialError)
      if (data.products.some((p) => p.barcode === barcode)) return fail('Esse código de barras já está cadastrado.')

      const product: AppProduct = {
        id: uid(),
        barcode,
        name,
        unit: productForm.unit,
        priceCents,
        stockMilli,
        minStockMilli,
        averageCostCents,
        catalogSource: productForm.catalogSource || undefined,
        catalogBrand: productForm.catalogBrand || undefined,
        catalogImageUrl: productForm.catalogImageUrl || undefined,
      }
      setData((current) => ({
        ...current,
        products: [...current.products, product],
        movements: stockMilli
          ? [
              ...current.movements,
              {
                id: uid(),
                productId: product.id,
                type: 'initial',
                quantityMilli: stockMilli,
                createdAt: new Date().toISOString(),
                note: 'Cadastro por scan unitário',
              },
            ]
          : current.movements,
      }))
      closeProductPanel()
      flash('Produto cadastrado no inventário.')
      return
    }

    if (productMode === 'edit' && editingProductId) {
      const saleError = validateSalePrice(priceCents)
      if (saleError) return fail(saleError)
      if (!Number.isFinite(averageCostCents) || averageCostCents < 0) return fail('Custo de compra inválido.')

      setData((current) => {
        const existing = current.products.find((p) => p.id === editingProductId)
        if (!existing) return current
        const stockDelta = stockMilli - existing.stockMilli
        const products = current.products.map((p) =>
          p.id === editingProductId
            ? { ...p, priceCents, averageCostCents, minStockMilli, stockMilli, unit: productForm.unit }
            : p,
        )
        const movements = stockDelta
          ? [
              ...current.movements,
              {
                id: uid(),
                productId: editingProductId,
                type: 'adjustment' as const,
                quantityMilli: stockDelta,
                createdAt: new Date().toISOString(),
                note: 'Ajuste no editor do produto',
              },
            ]
          : current.movements
        return { ...current, products, movements }
      })
      closeProductPanel()
      flash('Produto atualizado.')
    }
  }

  function receive(productId: string, amount: string, cost: string, note: string) {
    const q = toMilli(amount)
    const unitCost = toCents(cost)
    if (!Number.isInteger(q) || q <= 0 || !Number.isInteger(unitCost) || unitCost < 0) {
      return fail('Informe quantidade e custo de compra válidos.')
    }

    setData((current) => {
      const product = current.products.find((p) => p.id === productId)
      if (!product) return current
      const update = calculatePurchaseUpdate(product.stockMilli, product.averageCostCents, q, unitCost)
      return {
        ...current,
        products: current.products.map((p) => (p.id === productId ? { ...p, ...update } : p)),
        movements: [
          ...current.movements,
          {
            id: uid(),
            productId,
            type: 'purchase',
            quantityMilli: q,
            createdAt: new Date().toISOString(),
            note: note || 'Entrada manual de compra',
          },
        ],
      }
    })
    flash('Entrada manual registrada.')
  }

  async function loadInvoice(file: File) {
    setInvoiceLoading(true)
    setInvoiceReview(null)
    setError('')
    try {
      const parsed = parseNfeXml(await file.text())
      const marker = invoiceMarker(parsed)
      if (data.movements.some((movement) => movement.type === 'purchase' && movement.note.includes(marker))) {
        throw new Error('Esta NF-e já foi importada. O estoque não foi alterado novamente.')
      }

      const items = await Promise.all(
        parsed.items.map(async (item): Promise<InvoiceReviewLine> => {
          if (!item.barcode) {
            return {
              ...item,
              status: 'pending',
              name: item.description,
              brand: '',
              imageUrl: '',
              source: 'NF-e',
            }
          }

          const existing = data.products.find((product) => product.barcode === item.barcode)
          if (existing) {
            return {
              ...item,
              status: 'existing',
              productId: existing.id,
              name: existing.name,
              brand: existing.catalogBrand || '',
              imageUrl: existing.catalogImageUrl || '',
              source: existing.catalogSource || 'Inventário',
            }
          }

          try {
            const response = await fetch(`/api/products/lookup?barcode=${encodeURIComponent(item.barcode)}`, { cache: 'no-store' })
            const result = await response.json()
            if (result?.found && result?.product?.name) {
              return {
                ...item,
                status: 'new',
                name: String(result.product.name),
                brand: String(result.product.brand || ''),
                imageUrl: String(result.product.imageUrl || ''),
                source: String(result.source || 'Catálogo'),
              }
            }
          } catch {}

          return {
            ...item,
            status: 'new',
            name: item.description,
            brand: '',
            imageUrl: '',
            source: 'NF-e',
          }
        }),
      )

      setInvoiceReview({ ...parsed, items })
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : 'Não foi possível ler esta NF-e.')
    } finally {
      setInvoiceLoading(false)
    }
  }

  function confirmInvoice() {
    if (!invoiceReview) return
    const importable = invoiceReview.items.filter((item) => item.status !== 'pending' && item.barcode)
    const pending = invoiceReview.items.filter((item) => item.status === 'pending')
    if (!importable.length) return fail('Nenhum item desta NF-e tem EAN válido para importar automaticamente.')

    const marker = invoiceMarker(invoiceReview)
    if (data.movements.some((movement) => movement.type === 'purchase' && movement.note.includes(marker))) {
      return fail('Esta NF-e já foi importada.')
    }

    setData((current) => {
      let products = current.products.map((product) => ({ ...product }))
      const movements = [...current.movements]
      const now = new Date().toISOString()

      for (const line of importable) {
        let product = products.find((candidate) => candidate.barcode === line.barcode)
        if (!product) {
          product = {
            id: uid(),
            barcode: line.barcode,
            name: line.name || line.description,
            unit: 'UN',
            priceCents: 0,
            stockMilli: 0,
            minStockMilli: 0,
            averageCostCents: 0,
            catalogSource: line.source || undefined,
            catalogBrand: line.brand || undefined,
            catalogImageUrl: line.imageUrl || undefined,
          }
          products.push(product)
        }

        const update = calculatePurchaseUpdate(
          product.stockMilli,
          product.averageCostCents,
          line.quantityMilli,
          line.unitCostCents,
        )
        products = products.map((candidate) => (candidate.id === product!.id ? { ...candidate, ...update } : candidate))
        movements.push({
          id: uid(),
          productId: product.id,
          type: 'purchase',
          quantityMilli: line.quantityMilli,
          createdAt: now,
          note: `${marker} · NF ${invoiceReview.number || 's/n'} · ${invoiceReview.supplierName || 'Fornecedor'}`,
        })
      }

      return { ...current, products, movements }
    })

    if (pending.length) {
      setInvoiceReview({ ...invoiceReview, items: pending, imported: true })
      flash(`${importable.length} itens importados. ${pending.length} item(ns) sem EAN ficaram pendentes.`)
    } else {
      setInvoiceReview(null)
      flash(`${importable.length} itens importados da NF-e. Produtos novos ficaram com preço de venda pendente.`)
    }
  }

  async function handleCode(raw: string) {
    const code = raw.replace(/\s+/g, '').trim()
    if (!code) return

    if (scanTarget === 'product') {
      setScannerOpen(false)
      setTab('stock')
      const result = await prepareProduct(code)
      if (result === 'existing') flash('Produto encontrado. Você pode editar os dados comerciais abaixo.')
      return
    }

    const product = data.products.find((candidate) => candidate.barcode === code)
    if (!product) {
      setScannerOpen(false)
      setTab('stock')
      await prepareProduct(code)
      flash('Produto novo identificado. Complete preço de venda, custo de compra e salve.')
      return
    }

    const saleError = validateSalePrice(product.priceCents)
    if (saleError) {
      setScannerOpen(false)
      setTab('stock')
      editProduct(product)
      fail(`${product.name}: ${saleError}`)
      return
    }

    addCart(product, 1000)
    setScannerOpen(false)
    flash(`${product.name} adicionado ao carrinho.`)
  }

  function addCart(product: AppProduct, quantityMilli: number) {
    const saleError = validateSalePrice(product.priceCents)
    if (saleError) return fail(saleError)
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id)
      const total = (existing?.quantityMilli ?? 0) + quantityMilli
      if (total > product.stockMilli) {
        fail(`Estoque insuficiente: ${product.name} tem ${qty(product.stockMilli, product.unit)}.`)
        return current
      }
      if (existing) return current.map((line) => (line.productId === product.id ? { ...line, quantityMilli: total } : line))
      return [...current, { productId: product.id, quantityMilli, source: 'unit' }]
    })
  }

  function checkout() {
    if (!cart.length) return
    const pendingProduct = cart
      .map((line) => data.products.find((product) => product.id === line.productId))
      .find((product) => product && product.priceCents <= 0)
    if (pendingProduct) return fail(`Defina o preço de venda de ${pendingProduct.name} antes de concluir.`)

    try {
      const result = completeSale(
        data.products,
        cart.map((line) => ({ productId: line.productId, quantityMilli: line.quantityMilli })),
        uid(),
      )
      const byId = new Map(result.products.map((product) => [product.id, product]))
      const nextProducts = data.products.map((product) => ({
        ...product,
        stockMilli: byId.get(product.id)?.stockMilli ?? product.stockMilli,
      }))
      const movements: Movement[] = cart.map((line) => ({
        id: uid(),
        productId: line.productId,
        type: 'sale',
        quantityMilli: -line.quantityMilli,
        createdAt: result.sale.createdAt,
        note: `Venda ${result.sale.id.slice(0, 8)}`,
      }))
      setData((current) => ({
        ...current,
        products: nextProducts,
        sales: [result.sale, ...current.sales],
        movements: [...current.movements, ...movements],
      }))
      setCart([])
      flash(`Venda registrada: ${money(result.sale.totalCents)}.`)
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : 'Falha ao concluir venda.')
    }
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `rpg-inventario-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }

  function importBackup(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (!validStoreData(parsed)) throw new Error()
        setData({ ...parsed, scaleRule: parsed.scaleRule || DEFAULT_RULE })
        flash('Backup restaurado.')
      } catch {
        fail('Arquivo de backup inválido.')
      }
    }
    reader.readAsText(file)
  }

  if (!loaded) return null
  const cloudText =
    cloud === 'synced' ? 'Nuvem sincronizada' : cloud === 'syncing' ? 'Sincronizando…' : cloud === 'offline' ? 'Modo local' : 'Conectando…'

  return (
    <div className={styles.shell}>
      <header className={styles.top}>
        <div><span className={styles.brand}>RPG</span><strong>Mercadinho</strong></div>
        <span className={styles.status}>{cloud === 'offline' ? <CloudOff /> : <Cloud />}<b>{INVENTORY_APP_VERSION}</b><span> · {cloudText} · EAN/UPC</span></span>
      </header>

      <nav className={styles.nav}>
        <button className={tab === 'stock' ? styles.active : ''} onClick={() => setTab('stock')}><Boxes />Estoque</button>
        <button className={tab === 'intake' ? styles.active : ''} onClick={() => setTab('intake')}><FileUp />Entrada</button>
        <button className={tab === 'checkout' ? styles.active : ''} onClick={() => setTab('checkout')}><ShoppingCart />Caixa</button>
        <button className={tab === 'settings' ? styles.active : ''} onClick={() => setTab('settings')}><Settings />Ajustes</button>
      </nav>

      <main className={styles.main}>
        {notice && <div className={styles.success}><Check />{notice}</div>}
        {error && <div className={styles.error}>{error}<button onClick={() => setError('')}><X /></button></div>}

        {tab === 'stock' && (
          <Stock
            products={data.products}
            pendingPriceCount={pendingPriceCount}
            form={productForm}
            setForm={setProductForm}
            mode={productMode}
            lookup={lookup}
            save={saveProduct}
            close={closeProductPanel}
            scan={() => { setScanTarget('product'); setScannerOpen(true) }}
            edit={editProduct}
          />
        )}

        {tab === 'intake' && (
          <Intake
            products={data.products}
            receive={receive}
            review={invoiceReview}
            loading={invoiceLoading}
            loadInvoice={loadInvoice}
            clearReview={() => setInvoiceReview(null)}
            confirmInvoice={confirmInvoice}
          />
        )}

        {tab === 'checkout' && (
          <Checkout
            products={data.products}
            cart={cart}
            total={totalCents}
            scan={() => { setScanTarget('checkout'); setScannerOpen(true) }}
            manual={handleCode}
            change={(id, delta) => setCart((current) => current.map((line) => line.productId === id ? { ...line, quantityMilli: Math.max(0, line.quantityMilli + delta) } : line).filter((line) => line.quantityMilli > 0))}
            remove={(id) => setCart((current) => current.filter((line) => line.productId !== id))}
            checkout={checkout}
          />
        )}

        {tab === 'settings' && (
          <SettingsView
            cloud={cloudText}
            exportBackup={exportBackup}
            importBackup={importBackup}
            reset={() => {
              if (confirm('Apagar todos os dados deste inventário?')) {
                setData(emptyData())
                setCart([])
                setInvoiceReview(null)
                closeProductPanel()
              }
            }}
          />
        )}
      </main>

      {scannerOpen && <QuaggaScanner onCode={handleCode} close={() => setScannerOpen(false)} />}
    </div>
  )
}

function ProductIdentity({ form, lookup, mode }: { form: ProductForm; lookup: LookupState; mode: ProductMode }) {
  const manualName = mode === 'new' && lookup.status === 'new'
  return (
    <div className={styles.identity}>
      <div className={styles.identityMedia}>
        {form.catalogImageUrl ? <img src={form.catalogImageUrl} alt="" /> : <Barcode />}
      </div>
      <div className={styles.grow}>
        <span className={styles.eyebrow}>{mode === 'edit' ? 'Produto cadastrado' : lookup.status === 'loading' ? 'Pesquisando produto…' : lookup.status === 'found' ? 'Produto novo · reconhecido no catálogo' : 'Produto novo · preenchimento manual'}</span>
        {manualName ? (
          <label className={styles.fieldLabel}>Nome do produto <b>obrigatório</b><input value={form.name} readOnly /></label>
        ) : (
          <><h3>{form.name || 'Identificando…'}</h3><small>{form.catalogBrand || 'Marca não informada'} · EAN {form.barcode || '—'}</small></>
        )}
        {form.catalogSource && <small>Identificação: {form.catalogSource}</small>}
      </div>
    </div>
  )
}

function Stock({
  products,
  pendingPriceCount,
  form,
  setForm,
  mode,
  lookup,
  save,
  close,
  scan,
  edit,
}: {
  products: AppProduct[]
  pendingPriceCount: number
  form: ProductForm
  setForm: (form: ProductForm) => void
  mode: ProductMode
  lookup: LookupState
  save: () => void
  close: () => void
  scan: () => void
  edit: (product: AppProduct) => void
}) {
  const manualName = mode === 'new' && lookup.status === 'new'
  return (
    <>
      <section className={styles.hero}>
        <div>
          <span>Inventário</span>
          <h1>Produtos</h1>
          <p>Escaneie para cadastrar ou editar um item. O sistema busca nome, marca e foto; o lojista cuida dos dados comerciais.</p>
          {pendingPriceCount > 0 && <div className={styles.pendingNotice}>{pendingPriceCount} produto(s) aguardando preço de venda.</div>}
        </div>
        <button className={styles.primary} onClick={scan}><Camera />Escanear produto</button>
      </section>

      {mode && (
        <section className={styles.card}>
          <div className={styles.cardTitleRow}>
            <div><span className={styles.eyebrow}>{mode === 'edit' ? 'Produto cadastrado' : 'Produto novo'}</span><h2>{mode === 'edit' ? 'Editar dados do produto' : 'Definir dados comerciais'}</h2></div>
            <button className={styles.iconButton} onClick={close} aria-label="Fechar"><X /></button>
          </div>

          <div className={styles.identity}>
            <div className={styles.identityMedia}>{form.catalogImageUrl ? <img src={form.catalogImageUrl} alt="" /> : <Barcode />}</div>
            <div className={styles.grow}>
              <span className={styles.eyebrow}>{lookup.status === 'loading' ? 'Pesquisando produto…' : mode === 'edit' ? 'Produto cadastrado' : lookup.status === 'found' ? 'Produto novo · reconhecido no catálogo' : 'Produto novo · preenchimento manual'}</span>
              {manualName ? (
                <label className={styles.fieldLabel}>Nome do produto <b>obrigatório</b><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Digite o nome que aparece na embalagem" /></label>
              ) : (
                <><h3>{form.name || 'Identificando…'}</h3><small>{form.catalogBrand || 'Marca não informada'} · EAN {form.barcode}</small></>
              )}
              {form.catalogSource && <small>Fonte de identificação: {form.catalogSource}</small>}
            </div>
          </div>

          <div className={styles.commercialGrid}>
  <label className={styles.fieldLabel}>Preço de venda <b>obrigatório</b><input inputMode="decimal" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /><small>Quanto o cliente paga por uma unidade deste produto.</small></label>
  <label className={styles.fieldLabel}>Custo de compra {mode === 'new' ? <b>obrigatório</b> : <em>editável</em>}<input inputMode="decimal" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} /><small>Quanto o mercado pagou por unidade. Se o produto veio de uma NF-e, este valor já aparece preenchido.</small></label>
  <label className={styles.fieldLabel}>{mode === 'edit' ? 'Quantidade em estoque' : 'Quantidade a adicionar ao estoque'} <em>opcional</em><input inputMode="decimal" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} /><small>{mode === 'edit' ? 'Este é o saldo atual. Alterar o número registra um ajuste de estoque.' : 'Pode deixar 0 para apenas cadastrar o produto sem adicionar unidades.'}</small></label>
  <label className={styles.fieldLabel}>Estoque mínimo <em>opcional</em><input inputMode="decimal" value={form.minStock} onChange={(event) => setForm({ ...form, minStock: event.target.value })} /><small>Serve apenas para avisar quando o estoque estiver baixo.</small></label>
</div>

<div className={styles.actions}><button className={styles.primary} onClick={save} disabled={lookup.status === 'loading'}>{mode === 'edit' ? 'Salvar alterações' : 'Cadastrar produto'}</button><button className={styles.secondary} onClick={close}>Cancelar</button></div>
        </section>
      )}

      <section className={styles.productlist}>
        {products.length === 0 ? (
          <div className={styles.empty}><Boxes /><b>Nenhum produto</b><span>Escaneie um produto ou importe uma NF-e para começar.</span></div>
        ) : products.map((product) => (
          <article className={styles.product} key={product.id}>
            <div className={styles.productPhoto}>{product.catalogImageUrl ? <img src={product.catalogImageUrl} alt="" /> : <Barcode />}</div>
            <div className={styles.grow}>
              <b>{product.name}</b>
              <small>{product.catalogBrand ? `${product.catalogBrand} · ` : ''}EAN {product.barcode}</small>
              <div className={styles.pills}>
                <span className={product.priceCents > 0 ? '' : styles.pendingPill}>{product.priceCents > 0 ? `Venda ${money(product.priceCents)}` : 'Preço de venda pendente'}</span>
                <span>Compra {product.averageCostCents > 0 ? money(product.averageCostCents) : 'não informado'}</span>
              </div>
            </div>
            <div className={product.stockMilli <= product.minStockMilli ? styles.low : styles.stockqty}><strong>{qty(product.stockMilli, product.unit)}</strong><small>{product.stockMilli <= product.minStockMilli ? 'Estoque baixo' : 'Disponível'}</small></div>
            <button className={styles.editButton} onClick={() => edit(product)}><Pencil />Editar</button>
          </article>
        ))}
      </section>
    </>
  )
}

function Intake({
  products,
  receive,
  review,
  loading,
  loadInvoice,
  clearReview,
  confirmInvoice,
}: {
  products: AppProduct[]
  receive: (id: string, q: string, c: string, note: string) => void
  review: InvoiceReview | null
  loading: boolean
  loadInvoice: (file: File) => void | Promise<void>
  clearReview: () => void
  confirmInvoice: () => void
}) {
  const [id, setId] = useState('')
  const [q, setQ] = useState('')
  const [c, setC] = useState('')
  const [note, setNote] = useState('')
  const importableCount = review?.items.filter((item) => item.status !== 'pending').length ?? 0
  const pendingCount = review?.items.filter((item) => item.status === 'pending').length ?? 0

  return (
    <>
      <section className={styles.hero}>
        <div><span>Entrada de mercadoria</span><h1>Importar nota de compra</h1><p>A NF-e já traz os produtos, quantidades e custos de compra. Revise e importe tudo de uma vez; preço de venda não é pedido aqui.</p></div>
        <label className={styles.primary}>{loading ? 'Lendo NF-e…' : <><FileUp />Importar NF-e (XML)</>}<input hidden type="file" accept=".xml,text/xml,application/xml" disabled={loading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadInvoice(file); event.currentTarget.value = '' }} /></label>
      </section>

      {review && (
        <section className={styles.card}>
          <div className={styles.cardTitleRow}>
            <div><span className={styles.eyebrow}>{review.imported ? 'Importação concluída parcialmente' : 'Revisar antes de importar'}</span><h2>NF-e {review.number || 'sem número'}</h2><p>{review.supplierName || 'Fornecedor não identificado'}{review.issuedAt ? ` · ${new Date(review.issuedAt).toLocaleDateString('pt-BR')}` : ''}</p></div>
            <button className={styles.iconButton} onClick={clearReview}><X /></button>
          </div>

          <div className={styles.invoiceSummary}><div><strong>{review.items.length}</strong><span>itens na revisão</span></div><div><strong>{importableCount}</strong><span>prontos para importar</span></div><div><strong>{pendingCount}</strong><span>sem EAN / pendentes</span></div></div>

          <div className={styles.invoiceList}>
            {review.items.map((item) => (
              <article className={styles.invoiceLine} key={`${item.line}-${item.supplierCode}`}>
                <div className={styles.invoiceImage}>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <Barcode />}</div>
                <div className={styles.grow}><b>{item.name}</b><small>{item.barcode ? `EAN ${item.barcode}` : `Código fornecedor ${item.supplierCode || '—'}`}</small><small>{item.source}</small></div>
                <div className={styles.invoiceNumber}><span>Quantidade</span><strong>{(item.quantityMilli / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</strong></div>
                <div className={styles.invoiceNumber}><span>Custo un.</span><strong>{money(item.unitCostCents)}</strong></div>
                <div className={styles.invoiceNumber}><span>Total</span><strong>{money(item.totalCents)}</strong></div>
                <span className={`${styles.invoiceStatus} ${item.status === 'pending' ? styles.statusPending : item.status === 'existing' ? styles.statusExisting : styles.statusNew}`}>{item.status === 'pending' ? 'Precisa vincular' : item.status === 'existing' ? 'Já cadastrado' : 'Novo produto'}</span>
              </article>
            ))}
          </div>

          {pendingCount > 0 && <div className={styles.warningBox}>Itens sem EAN não são descartados da revisão, mas não entram automaticamente no estoque. Eles precisam ser cadastrados/vinculados por scan unitário.</div>}
          {!review.imported && <div className={styles.actions}><button className={styles.primary} disabled={!importableCount} onClick={confirmInvoice}>Importar {importableCount} item(ns) para o estoque</button><button className={styles.secondary} onClick={clearReview}>Cancelar</button></div>}
        </section>
      )}

      <section className={styles.card}>
        <details className={styles.manualDetails}>
          <summary>Entrada manual de compra <span>usar só quando não houver NF-e disponível</span></summary>
          <div className={styles.stack}>
            <label className={styles.fieldLabel}>Produto<select value={id} onChange={(event) => setId(event.target.value)}><option value="">Selecione...</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
            <label className={styles.fieldLabel}>Quantidade comprada<input inputMode="decimal" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Ex.: 12" /></label>
            <label className={styles.fieldLabel}>Custo de compra por unidade<input inputMode="decimal" value={c} onChange={(event) => setC(event.target.value)} placeholder="Ex.: 4,20" /><small>Esse custo entra no cálculo do custo médio do estoque.</small></label>
            <label className={styles.fieldLabel}>Referência <em>opcional</em><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Fornecedor / número da nota" /></label>
            <button className={styles.secondary} disabled={!id} onClick={() => { receive(id, q, c, note); setQ(''); setC(''); setNote('') }}>Confirmar entrada manual <ChevronRight /></button>
          </div>
        </details>
      </section>
    </>
  )
}

function Checkout({ products, cart, total, scan, manual, change, remove, checkout }: { products: AppProduct[]; cart: CartLine[]; total: number; scan: () => void; manual: (value: string) => void | Promise<void>; change: (id: string, delta: number) => void; remove: (id: string) => void; checkout: () => void }) {
  const [code, setCode] = useState('')
  return (
    <>
      <section className={styles.hero}><div><span>Checkout</span><h1>Caixa</h1><p>Leia o código do produto. SKU sem preço de venda abre automaticamente no editor antes de entrar no carrinho.</p></div><button className={styles.primary} onClick={scan}><ScanLine />Escanear item</button></section>
      <section className={styles.scanbar}><input inputMode="numeric" placeholder="Leitor USB / código manual" value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && code.trim()) { void manual(code); setCode('') } }} /><button onClick={() => { void manual(code); setCode('') }}>Adicionar</button></section>
      <section className={styles.checkoutgrid}>
        <div className={styles.productlist}>{cart.length === 0 ? <div className={styles.empty}><ShoppingCart /><b>Carrinho vazio</b><span>Toque em “Escanear item”.</span></div> : cart.map((line) => { const product = products.find((candidate) => candidate.id === line.productId); if (!product) return null; return <article className={styles.cartline} key={line.productId}><div className={styles.grow}><b>{product.name}</b><small>{qty(line.quantityMilli, product.unit)}</small></div><div className={styles.cartstep}><button onClick={() => change(product.id, -1000)}>−</button><strong>{qty(line.quantityMilli, product.unit)}</strong><button onClick={() => change(product.id, 1000)}>+</button></div><b>{money(Math.round((product.priceCents * line.quantityMilli) / 1000))}</b><button className={styles.trash} onClick={() => remove(product.id)}><Trash2 /></button></article> })}</div>
        <aside className={styles.total}><span>Total</span><strong>{money(total)}</strong><button className={styles.pay} disabled={!cart.length} onClick={checkout}>CONFIRMAR VENDA</button><small>A baixa fica local e sincroniza com o banco quando houver conexão.</small></aside>
      </section>
    </>
  )
}

function SettingsView({ cloud, exportBackup, importBackup, reset }: { cloud: string; exportBackup: () => void; importBackup: (file: File) => void; reset: () => void }) {
  return (
    <>
      <section className={styles.hero}><div><span>Configuração</span><h1>Inventário</h1><p>Versão {INVENTORY_APP_VERSION}. Scan unitário para cadastro/edição e NF-e XML para entrada em massa.</p></div></section>
      <section className={styles.card}><h2>Persistência</h2><p>{cloud}. O navegador mantém uma cópia local e sincroniza com o banco quando disponível.</p></section>
      <section className={styles.card}><h2>Backup</h2><div className={styles.actions}><button className={styles.secondary} onClick={exportBackup}>Exportar backup JSON</button><label className={styles.secondary}>Importar backup<input hidden type="file" accept="application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) importBackup(file) }} /></label><button className={styles.danger} onClick={reset}><RotateCcw />Apagar dados do inventário</button></div></section>
    </>
  )
}
