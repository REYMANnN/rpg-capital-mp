'use client'

import { useMemo, useState } from 'react'
import { Barcode, Camera, Check, FileUp, Pencil, Search, X } from 'lucide-react'
import { parseNfeXml, type ParsedNfe } from '@/lib/inventory/nfe'
import { DEMO_NFE_ACCESS_KEY, isValidNfeAccessKey, normalizeNfeAccessKey } from '@/lib/inventory/nfeKey'
import { editInvoiceReviewLine, importableInvoiceLines, type InvoiceReviewLineV10 } from '@/lib/inventory/invoiceReview'
import { pickBestProductCandidate, type ProductCandidate } from '@/lib/inventory/productMatcher'
import QuaggaScanner from './QuaggaScanner'
import styles from './inventory.module.css'

type ProductLike = {
  id: string
  barcode: string
  name: string
  catalogBrand?: string
  catalogImageUrl?: string
  catalogSource?: string
}

type Props = {
  products: ProductLike[]
  onCommit: (invoice: ParsedNfe, lines: InvoiceReviewLineV10[]) => void
  fail: (message: string) => void
  flash: (message: string) => void
}

type Phase = 'idle' | 'resolving' | 'questions' | 'review'

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const numberValue = (value: string) => Number(value.replace(/\./g, '').replace(',', '.'))

async function productByBarcode(barcode: string, products: ProductLike[]) {
  const local = products.find((product) => product.barcode === barcode)
  if (local) return {
    barcode,
    name: local.name,
    brand: local.catalogBrand || '',
    imageUrl: local.catalogImageUrl || '',
    source: local.catalogSource || 'Inventário',
    productId: local.id,
  }

  try {
    const response = await fetch(`/api/products/lookup?barcode=${encodeURIComponent(barcode)}`, { cache: 'no-store' })
    const result = await response.json()
    if (result?.found && result?.product?.name) return {
      barcode,
      name: String(result.product.name),
      brand: String(result.product.brand || ''),
      imageUrl: String(result.product.imageUrl || ''),
      source: String(result.source || 'Catálogo'),
      productId: undefined,
    }
  } catch {}
  return { barcode, name: `Produto ${barcode}`, brand: '', imageUrl: '', source: 'EAN', productId: undefined }
}

export default function InvoiceIntakeV10({ products, onCommit, fail, flash }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [invoice, setInvoice] = useState<ParsedNfe | null>(null)
  const [lines, setLines] = useState<InvoiceReviewLineV10[]>([])
  const [scanner, setScanner] = useState<'invoice' | 'item' | null>(null)
  const [editingLine, setEditingLine] = useState<number | null>(null)
  const [manualEan, setManualEan] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<ProductCandidate[]>([])

  const currentQuestion = useMemo(() => lines.find((line) => !line.confirmed), [lines])
  const selectedCount = useMemo(() => importableInvoiceLines(lines).length, [lines])
  const editLine = editingLine == null ? null : lines.find((line) => line.line === editingLine) || null

  async function saveAlias(line: InvoiceReviewLineV10) {
    if (!invoice?.supplierDocument || !line.supplierCode || !line.barcode) return
    try {
      await fetch('/api/inventory/supplier-alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierDocument: invoice.supplierDocument,
          supplierCode: line.supplierCode,
          barcode: line.barcode,
          canonicalName: line.name,
          observedDescription: line.description,
        }),
      })
    } catch {}
  }

  async function resolveParsed(parsed: ParsedNfe) {
    setPhase('resolving')
    setInvoice(parsed)
    const resolved: InvoiceReviewLineV10[] = []

    for (const item of parsed.items) {
      if (item.barcode) {
        const product = await productByBarcode(item.barcode, products)
        resolved.push({ ...item, ...product, resolution: 'ean', confirmed: true, selected: true })
        continue
      }

      if (parsed.supplierDocument && item.supplierCode) {
        try {
          const response = await fetch(`/api/inventory/supplier-alias?document=${encodeURIComponent(parsed.supplierDocument)}&code=${encodeURIComponent(item.supplierCode)}`, { cache: 'no-store' })
          const result = await response.json()
          if (result?.found && result?.alias?.barcode) {
            const product = await productByBarcode(String(result.alias.barcode), products)
            resolved.push({ ...item, ...product, resolution: 'alias', confirmed: true, selected: true })
            continue
          }
        } catch {}
      }

      let candidates: ProductCandidate[] = []
      try {
        const response = await fetch(`/api/inventory/catalog-search?q=${encodeURIComponent(item.description)}`, { cache: 'no-store' })
        const result = await response.json()
        candidates = Array.isArray(result?.items) ? result.items : []
      } catch {}
      const best = pickBestProductCandidate(item.description, candidates)
      if (best) {
        resolved.push({
          ...item,
          barcode: best.candidate.barcode,
          name: best.candidate.name,
          brand: best.candidate.brand || '',
          imageUrl: best.candidate.imageUrl || '',
          source: `Sugestão por nome · ${Math.round(best.score * 100)}%`,
          resolution: 'suggested',
          confirmed: false,
          selected: true,
        })
      } else {
        resolved.push({ ...item, name: item.description, brand: '', imageUrl: '', source: 'Não identificado', resolution: 'unresolved', confirmed: false, selected: true })
      }
    }

    setLines(resolved)
    setPhase(resolved.some((line) => !line.confirmed) ? 'questions' : 'review')
  }

  async function scanInvoiceKey(raw: string) {
    setScanner(null)
    const key = normalizeNfeAccessKey(raw)
    if (!isValidNfeAccessKey(key)) return fail('O código lido não é uma chave NF-e válida de 44 dígitos.')
    try {
      const response = await fetch(`/api/inventory/nfe/by-key?key=${encodeURIComponent(key)}`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok || !result?.invoice) return fail(result?.message || 'A chave foi lida, mas não foi possível recuperar os itens da NF-e.')
      await resolveParsed(result.invoice as ParsedNfe)
      if (key === DEMO_NFE_ACCESS_KEY) flash('NF-e fictícia carregada. Agora revise o reconhecimento dos produtos.')
    } catch {
      fail('Falha ao consultar a NF-e pela chave.')
    }
  }

  async function loadXml(file: File) {
    try { await resolveParsed(parseNfeXml(await file.text())) }
    catch (error) { fail(error instanceof Error ? error.message : 'XML de NF-e inválido.') }
  }

  function updateLine(lineNumber: number, patch: Partial<InvoiceReviewLineV10>) {
    setLines((current) => current.map((line) => line.line === lineNumber ? editInvoiceReviewLine(line, patch) : line))
  }

  function finishQuestion(line: InvoiceReviewLineV10, patch: Partial<InvoiceReviewLineV10>) {
    const next = editInvoiceReviewLine(line, { ...patch, confirmed: true })
    setLines((current) => current.map((item) => item.line === line.line ? next : item))
    void saveAlias(next)
    const remaining = lines.filter((item) => item.line !== line.line && !item.confirmed)
    if (!remaining.length) setPhase('review')
    setManualEan('')
    setSearchQuery('')
    setSearchResults([])
  }

  async function resolveWithBarcode(line: InvoiceReviewLineV10, rawBarcode: string) {
    const barcode = String(rawBarcode).replace(/\D+/g, '')
    if (!/^\d{8,14}$/.test(barcode)) return fail('EAN inválido.')
    const product = await productByBarcode(barcode, products)
    finishQuestion(line, { ...product, barcode, resolution: 'manual', selected: true })
  }

  async function searchProducts() {
    const query = searchQuery.trim()
    if (query.length < 3) return
    setSearching(true)
    try {
      const response = await fetch(`/api/inventory/catalog-search?q=${encodeURIComponent(query)}`, { cache: 'no-store' })
      const result = await response.json()
      setSearchResults(Array.isArray(result?.items) ? result.items : [])
    } finally { setSearching(false) }
  }

  function reset() {
    setPhase('idle'); setInvoice(null); setLines([]); setEditingLine(null); setSearchResults([]); setSearchQuery(''); setManualEan('')
  }

  return (
    <>
      <section className={styles.hero}>
        <div><span>Entrada de mercadoria · v10</span><h1>Escanear nota de compra</h1><p>Aponte para o código de barras da NF-e. O sistema identifica os itens, pergunta apenas o que estiver incerto e mostra tudo para aprovação antes de alterar o estoque.</p></div>
        <div className={styles.actions}>
          <button className={styles.primary} onClick={() => setScanner('invoice')} disabled={phase === 'resolving'}><Camera />Escanear nota</button>
          <label className={styles.secondary}><FileUp />Importar XML<input hidden type="file" accept=".xml,text/xml,application/xml" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadXml(file); event.currentTarget.value = '' }} /></label>
        </div>
      </section>

      {phase === 'resolving' && <section className={styles.card}><h2>Identificando produtos…</h2><p>Consultando EAN, códigos já conhecidos do fornecedor e proximidade de nomes.</p></section>}

      {phase === 'questions' && currentQuestion && (
        <section className={styles.card}>
          <div className={styles.cardTitleRow}><div><span className={styles.eyebrow}>Resolver antes da revisão</span><h2>Este produto é este aqui?</h2></div><button className={styles.iconButton} onClick={reset}><X /></button></div>
          <div className={styles.identity}>
            <div className={styles.identityMedia}>{currentQuestion.imageUrl ? <img src={currentQuestion.imageUrl} alt="" /> : <Barcode />}</div>
            <div className={styles.grow}>
              <small>Na nota</small><b>{currentQuestion.description}</b><small>Código fornecedor {currentQuestion.supplierCode || '—'} · {(currentQuestion.quantityMilli / 1000).toLocaleString('pt-BR')} un. · {money(currentQuestion.unitCostCents)}/un.</small>
              {currentQuestion.barcode ? <><small>O sistema encontrou</small><h3>{currentQuestion.name}</h3><small>EAN {currentQuestion.barcode} · {currentQuestion.source}</small></> : <h3>Nenhum candidato seguro</h3>}
            </div>
          </div>

          {currentQuestion.barcode && <div className={styles.actions}><button className={styles.primary} onClick={() => finishQuestion(currentQuestion, { resolution: 'suggested', selected: true })}><Check />Sim, é este</button><button className={styles.secondary} onClick={() => updateLine(currentQuestion.line, { barcode: '', name: currentQuestion.description, imageUrl: '', brand: '', source: 'Corrigir associação', resolution: 'unresolved' })}>Não, corrigir</button></div>}

          {!currentQuestion.barcode && <>
            <div className={styles.commercialGrid}>
              <label className={styles.fieldLabel}>Pesquisar produto conhecido<input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchProducts() }} /><small>Pesquise pelo nome correto, marca ou tamanho.</small></label>
              <label className={styles.fieldLabel}>Digitar EAN manualmente<input inputMode="numeric" value={manualEan} onChange={(event) => setManualEan(event.target.value)} /><small>Ou leia o código diretamente da embalagem.</small></label>
            </div>
            <div className={styles.actions}><button className={styles.secondary} onClick={() => void searchProducts()} disabled={searching}><Search />{searching ? 'Pesquisando…' : 'Pesquisar'}</button><button className={styles.secondary} onClick={() => setScanner('item')}><Camera />Escanear EAN</button><button className={styles.primary} onClick={() => void resolveWithBarcode(currentQuestion, manualEan)} disabled={!manualEan.trim()}>Usar EAN digitado</button><button className={styles.secondary} onClick={() => finishQuestion(currentQuestion, { selected: false, resolution: 'unresolved', barcode: '', name: currentQuestion.description })}>Não importar este item</button></div>
            {searchResults.length > 0 && <div className={styles.productlist}>{searchResults.slice(0, 8).map((candidate) => <article className={styles.product} key={candidate.barcode}><div className={styles.productPhoto}>{candidate.imageUrl ? <img src={candidate.imageUrl} alt="" /> : <Barcode />}</div><div className={styles.grow}><b>{candidate.name}</b><small>{candidate.brand || 'Marca não informada'} · EAN {candidate.barcode}</small></div><button className={styles.editButton} onClick={() => finishQuestion(currentQuestion, { barcode: candidate.barcode, name: candidate.name, brand: candidate.brand || '', imageUrl: candidate.imageUrl || '', source: candidate.source || 'Catálogo', resolution: 'manual', selected: true })}>Associar</button></article>)}</div>}
          </>}
        </section>
      )}

      {phase === 'review' && invoice && (
        <section className={styles.card}>
          <div className={styles.cardTitleRow}><div><span className={styles.eyebrow}>Aprovação final</span><h2>NF-e {invoice.number || 'sem número'}</h2><p>{invoice.supplierName || 'Fornecedor'} · {invoice.supplierDocument || 'documento não informado'}</p></div><button className={styles.iconButton} onClick={reset}><X /></button></div>
          <div className={styles.actions}><button className={styles.secondary} onClick={() => setLines((current) => current.map((line) => ({ ...line, selected: line.confirmed && Boolean(line.barcode) })))}>Selecionar todos os prontos</button><button className={styles.secondary} onClick={() => setLines((current) => current.map((line) => ({ ...line, selected: false })))}>Desmarcar todos</button></div>
          <div className={styles.invoiceList}>
            {lines.map((line) => <article className={styles.invoiceLine} key={`${line.line}-${line.supplierCode}`}>
              <input type="checkbox" checked={line.selected} disabled={!line.confirmed || !line.barcode} onChange={(event) => updateLine(line.line, { selected: event.target.checked })} />
              <div className={styles.grow}><b>{line.name}</b><small>Nota: {line.description}</small><small>{line.barcode ? `EAN ${line.barcode}` : `cProd ${line.supplierCode || '—'}`} · {line.source}</small></div>
              <div className={styles.invoiceNumber}><span>Qtd.</span><strong>{(line.quantityMilli / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</strong></div>
              <div className={styles.invoiceNumber}><span>Custo un.</span><strong>{money(line.unitCostCents)}</strong></div>
              <div className={styles.invoiceNumber}><span>Total</span><strong>{money(line.totalCents)}</strong></div>
              <button className={styles.editButton} onClick={() => setEditingLine(line.line)}><Pencil />Editar</button>
            </article>)}
          </div>
          <div className={styles.actions}><button className={styles.primary} disabled={!selectedCount} onClick={() => { onCommit(invoice, importableInvoiceLines(lines)); reset() }}>CONFIRMAR ENTRADA — {selectedCount} ITENS</button><button className={styles.secondary} onClick={reset}>Cancelar</button></div>
        </section>
      )}

      {editLine && <section className={styles.card}>
        <div className={styles.cardTitleRow}><div><span className={styles.eyebrow}>Editar item da compra</span><h2>{editLine.name}</h2></div><button className={styles.iconButton} onClick={() => setEditingLine(null)}><X /></button></div>
        <div className={styles.commercialGrid}>
          <label className={styles.fieldLabel}>Produto / nome<input value={editLine.name} onChange={(event) => updateLine(editLine.line, { name: event.target.value })} /></label>
          <label className={styles.fieldLabel}>EAN / código<input inputMode="numeric" value={editLine.barcode} onChange={(event) => updateLine(editLine.line, { barcode: event.target.value.replace(/\D+/g, ''), confirmed: /^\d{8,14}$/.test(event.target.value.replace(/\D+/g, '')) })} /></label>
          <label className={styles.fieldLabel}>Descrição da nota<input value={editLine.description} onChange={(event) => updateLine(editLine.line, { description: event.target.value })} /></label>
          <label className={styles.fieldLabel}>Quantidade<input inputMode="decimal" value={(editLine.quantityMilli / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} onChange={(event) => { const value = numberValue(event.target.value); if (Number.isFinite(value) && value >= 0) updateLine(editLine.line, { quantityMilli: Math.round(value * 1000) }) }} /></label>
          <label className={styles.fieldLabel}>Custo unitário<input inputMode="decimal" value={(editLine.unitCostCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} onChange={(event) => { const value = numberValue(event.target.value); if (Number.isFinite(value) && value >= 0) updateLine(editLine.line, { unitCostCents: Math.round(value * 100) }) }} /></label>
        </div>
        <div className={styles.actions}><button className={styles.primary} onClick={() => { const latest = lines.find((line) => line.line === editLine.line); if (latest) void saveAlias(latest); setEditingLine(null) }}>Salvar item</button><button className={styles.secondary} onClick={() => setScanner('item')}><Camera />Escanear EAN</button></div>
      </section>}

      <section className={styles.card}><p><b>Fallback:</b> o XML continua disponível para quando a chave real for lida mas a recuperação oficial ainda não estiver autorizada para aquele CNPJ.</p></section>

      {scanner && <QuaggaScanner onCode={(code) => scanner === 'invoice' ? void scanInvoiceKey(code) : currentQuestion ? void resolveWithBarcode(currentQuestion, code) : editLine ? void resolveWithBarcode(editLine, code) : setScanner(null)} close={() => setScanner(null)} />}
    </>
  )
}
