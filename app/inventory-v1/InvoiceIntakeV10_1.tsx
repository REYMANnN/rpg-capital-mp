'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Barcode, Camera, Check, FileUp, Pencil, Search, X } from 'lucide-react'
import { parseNfeXml, type ParsedNfe } from '@/lib/inventory/nfe'
import { DEMO_NFE_ACCESS_KEY, isValidNfeAccessKey, normalizeNfeAccessKey } from '@/lib/inventory/nfeKey'
import {
  editInvoiceReviewLine,
  importableInvoiceLines,
  pendingInvoiceLines,
  requiresPackageFactor,
  type InvoiceReviewLineV10,
} from '@/lib/inventory/invoiceReview'
import { resolveInvoiceLine, type ResolverProduct, type SupplierAliasCandidate } from '@/lib/inventory/invoiceResolver'
import { scoreProductCandidate, type ProductCandidate } from '@/lib/inventory/productMatcher'
import QuaggaScanner from './QuaggaScanner'
import styles from './inventory.module.css'

type ProductLike = {
  id: string
  barcode: string
  name: string
  priceCents: number
  unit: 'UN' | 'KG'
  catalogBrand?: string
  catalogImageUrl?: string
  catalogSource?: string
}

type Props = {
  products: ProductLike[]
  onCommit: (invoice: ParsedNfe, lines: InvoiceReviewLineV10[]) => void
  isDuplicateInvoice: (invoice: ParsedNfe) => boolean
  fail: (message: string) => void
  flash: (message: string) => void
}

type Phase = 'idle' | 'resolving' | 'questions' | 'review'
type ScannerTarget = 'invoice' | 'question-item' | 'edit-item' | null

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const qty = (milli: number) => (milli / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

function numberValue(value: string) {
  const raw = value.trim().replace(/\s+/g, '')
  if (raw.includes(',') && raw.includes('.')) return Number(raw.replace(/\./g, '').replace(',', '.'))
  if (raw.includes(',')) return Number(raw.replace(',', '.'))
  return Number(raw)
}

function localResolverProducts(products: ProductLike[]): ResolverProduct[] {
  return products.map((product) => ({
    id: product.id,
    barcode: product.barcode,
    name: product.name,
    brand: product.catalogBrand || '',
    imageUrl: product.catalogImageUrl || '',
    source: product.catalogSource || 'Inventário',
    priceCents: product.priceCents,
    unit: product.unit,
    local: true,
  }))
}

async function catalogProductByBarcode(barcode: string): Promise<ResolverProduct | null> {
  try {
    const response = await fetch(`/api/products/lookup?barcode=${encodeURIComponent(barcode)}`, { cache: 'no-store' })
    const result = await response.json()
    if (result?.found && result?.product?.name) {
      return {
        barcode,
        name: String(result.product.name),
        brand: String(result.product.brand || ''),
        imageUrl: String(result.product.imageUrl || ''),
        source: String(result.source || 'Catálogo'),
        priceCents: 0,
        unit: 'UN',
      }
    }
  } catch {}
  return null
}

async function catalogSearch(query: string): Promise<ResolverProduct[]> {
  try {
    const response = await fetch(`/api/inventory/catalog-search?q=${encodeURIComponent(query)}`, { cache: 'no-store' })
    const result = await response.json()
    if (!Array.isArray(result?.items)) return []
    return result.items.map((item: ProductCandidate) => ({ ...item, priceCents: 0, unit: 'UN' as const }))
  } catch {
    return []
  }
}

async function supplierAlias(document: string, code: string): Promise<SupplierAliasCandidate | null> {
  if (!document || !code) return null
  try {
    const response = await fetch(`/api/inventory/supplier-alias?document=${encodeURIComponent(document)}&code=${encodeURIComponent(code)}`, { cache: 'no-store' })
    const result = await response.json()
    return result?.found && result?.alias?.barcode ? result.alias as SupplierAliasCandidate : null
  } catch {
    return null
  }
}

export default function InvoiceIntakeV10_1({ products, onCommit, isDuplicateInvoice, fail, flash }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [invoice, setInvoice] = useState<ParsedNfe | null>(null)
  const [lines, setLines] = useState<InvoiceReviewLineV10[]>([])
  const [scanner, setScanner] = useState<ScannerTarget>(null)
  const [editingLine, setEditingLine] = useState<number | null>(null)
  const [manualEan, setManualEan] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<ProductCandidate[]>([])
  const [packageFactorInput, setPackageFactorInput] = useState('')
  const [questionTotal, setQuestionTotal] = useState(0)
  const [learningWarning, setLearningWarning] = useState(false)

  const pending = useMemo(() => pendingInvoiceLines(lines), [lines])
  const currentQuestion = pending[0] || null
  const questionIndex = questionTotal > 0 ? questionTotal - pending.length + 1 : 0
  const selectedCount = useMemo(() => importableInvoiceLines(lines).length, [lines])
  const editLine = editingLine == null ? null : lines.find((line) => line.line === editingLine) || null
  const pendingPriceCount = useMemo(() => lines.filter((line) => line.decisionState !== 'excluded' && line.storeStatus !== 'existing-priced').length, [lines])

  function reset() {
    setPhase('idle')
    setInvoice(null)
    setLines([])
    setScanner(null)
    setEditingLine(null)
    setManualEan('')
    setSearchQuery('')
    setSearchResults([])
    setPackageFactorInput('')
    setQuestionTotal(0)
    setLearningWarning(false)
  }

  function setResolvedLines(next: InvoiceReviewLineV10[]) {
    setLines(next)
    const nextPending = pendingInvoiceLines(next)
    setPhase(nextPending.length ? 'questions' : 'review')
    if (nextPending[0]?.decisionState === 'needs-package-factor') {
      setPackageFactorInput(nextPending[0].packageFactor > 0 ? String(nextPending[0].packageFactor) : '')
    } else {
      setPackageFactorInput('')
    }
  }

  async function saveAlias(line: InvoiceReviewLineV10) {
    if (!invoice?.supplierDocument || !line.supplierCode || !line.barcode || line.decisionState !== 'resolved') return true
    try {
      const response = await fetch('/api/inventory/supplier-alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierDocument: invoice.supplierDocument,
          supplierCode: line.supplierCode,
          barcode: line.barcode,
          canonicalName: line.name,
          observedDescription: line.description,
          purchaseUnit: line.purchaseUnit,
          packageFactor: line.packageFactor || 1,
        }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.learned) throw new Error('alias_write_failed')
      return true
    } catch {
      setLearningWarning(true)
      return false
    }
  }

  async function resolveParsed(parsed: ParsedNfe) {
    if (isDuplicateInvoice(parsed)) {
      fail('Esta NF-e já foi importada. O estoque não foi alterado novamente.')
      return
    }

    setPhase('resolving')
    setInvoice(parsed)
    setLearningWarning(false)
    const local = localResolverProducts(products)
    const resolved: InvoiceReviewLineV10[] = []

    for (const item of parsed.items) {
      const alias = await supplierAlias(parsed.supplierDocument, item.supplierCode)
      let remoteCandidates: ResolverProduct[] = []

      if (item.barcode) {
        const exactLocal = local.find((product) => product.barcode === item.barcode)
        if (!exactLocal) {
          const remote = await catalogProductByBarcode(item.barcode)
          if (remote) remoteCandidates = [remote]
        }
      } else {
        remoteCandidates = await catalogSearch(item.description)
      }

      resolved.push(resolveInvoiceLine({ item, localProducts: local, catalogCandidates: remoteCandidates, alias }))
    }

    const unresolvedCount = pendingInvoiceLines(resolved).length
    setQuestionTotal(unresolvedCount)
    setResolvedLines(resolved)
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
      if (key === DEMO_NFE_ACCESS_KEY) flash('NF-e de teste carregada. Primeiro resolva as pendências; a revisão completa aparece depois.')
    } catch {
      fail('Falha ao consultar a NF-e pela chave.')
    }
  }

  async function loadXml(file: File) {
    try {
      await resolveParsed(parseNfeXml(await file.text()))
    } catch (error) {
      fail(error instanceof Error ? error.message : 'XML de NF-e inválido.')
    }
  }

  function updateLine(lineNumber: number, patch: Partial<InvoiceReviewLineV10>) {
    setLines((current) => current.map((line) => line.line === lineNumber ? editInvoiceReviewLine(line, patch) : line))
  }

  async function applyDecision(line: InvoiceReviewLineV10, patch: Partial<InvoiceReviewLineV10>, learn = true) {
    let next = editInvoiceReviewLine(line, patch)
    if (next.decisionState !== 'excluded') {
      const needsFactor = requiresPackageFactor(next.purchaseUnit) && next.packageFactor <= 0
      if (needsFactor) next = editInvoiceReviewLine(next, { decisionState: 'needs-package-factor', confirmed: false })
    }

    const nextLines = lines.map((item) => item.line === line.line ? next : item)
    setResolvedLines(nextLines)
    setManualEan('')
    setSearchQuery('')
    setSearchResults([])
    if (learn && next.decisionState === 'resolved') await saveAlias(next)
  }

  async function chooseBarcode(line: InvoiceReviewLineV10, rawBarcode: string, source = 'EAN confirmado manualmente') {
    const barcode = String(rawBarcode).replace(/\D+/g, '')
    if (!/^\d{8,14}$/.test(barcode)) return fail('EAN inválido.')
    setScanner(null)
    const local = products.find((product) => product.barcode === barcode)
    const remote = local ? null : await catalogProductByBarcode(barcode)
    const product = local ? {
      name: local.name,
      brand: local.catalogBrand || '',
      imageUrl: local.catalogImageUrl || '',
      productId: local.id,
      salePriceCents: local.priceCents,
      storeStatus: local.priceCents > 0 ? 'existing-priced' as const : 'existing-unpriced' as const,
    } : {
      name: remote?.name || line.description,
      brand: remote?.brand || '',
      imageUrl: remote?.imageUrl || '',
      productId: undefined,
      salePriceCents: 0,
      storeStatus: 'new' as const,
    }

    await applyDecision(line, {
      barcode,
      ...product,
      source,
      resolution: 'manual',
      identityStatus: 'manual',
      decisionState: requiresPackageFactor(line.purchaseUnit) && line.packageFactor <= 0 ? 'needs-package-factor' : 'resolved',
      confirmed: !requiresPackageFactor(line.purchaseUnit) || line.packageFactor > 0,
      selected: true,
      conflictingAliasBarcode: undefined,
    })
  }

  async function acceptSuggestion(line: InvoiceReviewLineV10) {
    await applyDecision(line, {
      resolution: 'manual',
      identityStatus: 'manual',
      decisionState: requiresPackageFactor(line.purchaseUnit) && line.packageFactor <= 0 ? 'needs-package-factor' : 'resolved',
      confirmed: !requiresPackageFactor(line.purchaseUnit) || line.packageFactor > 0,
      selected: true,
    })
  }

  function rejectSuggestion(line: InvoiceReviewLineV10) {
    setResolvedLines(lines.map((item) => item.line === line.line ? editInvoiceReviewLine(item, {
      barcode: '',
      name: item.description,
      brand: '',
      imageUrl: '',
      source: 'Corrigir associação',
      resolution: 'unresolved',
      identityStatus: 'unresolved',
      decisionState: 'needs-identity',
      confirmed: false,
      productId: undefined,
      salePriceCents: 0,
      storeStatus: 'new',
      conflictingAliasBarcode: undefined,
    }) : item))
  }

  async function useExplicitEanDespiteConflict(line: InvoiceReviewLineV10) {
    await chooseBarcode(line, line.barcode, 'EAN desta NF-e confirmado; histórico do fornecedor revisado')
  }

  async function useHistoricalAlias(line: InvoiceReviewLineV10) {
    if (!line.conflictingAliasBarcode) return
    await chooseBarcode(line, line.conflictingAliasBarcode, 'Associação histórica do fornecedor confirmada')
  }

  async function confirmPackageFactor(line: InvoiceReviewLineV10) {
    const factor = numberValue(packageFactorInput)
    if (!Number.isFinite(factor) || factor <= 0) return fail('Informe quantas unidades existem em cada embalagem.')
    const next = editInvoiceReviewLine(line, { packageFactor: factor, decisionState: 'resolved', confirmed: true, selected: true })
    const nextLines = lines.map((item) => item.line === line.line ? next : item)
    setResolvedLines(nextLines)
    await saveAlias(next)
  }

  async function searchProducts() {
    const query = searchQuery.trim()
    if (query.length < 2) return
    setSearching(true)
    try {
      const local = products
        .map((product) => ({
          barcode: product.barcode,
          name: product.name,
          brand: product.catalogBrand || '',
          imageUrl: product.catalogImageUrl || '',
          source: `Já cadastrado neste mercado · ${product.priceCents > 0 ? money(product.priceCents) : 'preço pendente'}`,
          score: scoreProductCandidate(query, product.name),
        }))
        .filter((item) => item.score >= 0.15)
        .sort((a, b) => b.score - a.score)
      const remote = await catalogSearch(query)
      const merged = new Map<string, ProductCandidate & { score?: number }>()
      for (const candidate of [...local, ...remote]) if (candidate.barcode && !merged.has(candidate.barcode)) merged.set(candidate.barcode, candidate)
      setSearchResults([...merged.values()].slice(0, 20))
    } finally {
      setSearching(false)
    }
  }

  function excludeLine(line: InvoiceReviewLineV10) {
    applyDecision(line, {
      selected: false,
      decisionState: 'excluded',
      confirmed: true,
      source: 'Não será importado',
    }, false)
  }

  function reopenExcluded(line: InvoiceReviewLineV10) {
    const next = editInvoiceReviewLine(line, {
      decisionState: line.barcode ? 'needs-identity' : 'needs-identity',
      confirmed: false,
      selected: true,
      source: line.barcode ? 'Reconfirmar associação' : 'Não identificado',
    })
    const nextLines = lines.map((item) => item.line === line.line ? next : item)
    setQuestionTotal((current) => Math.max(current, pendingInvoiceLines(nextLines).length))
    setResolvedLines(nextLines)
  }

  const unresolvedEditor = currentQuestion?.decisionState === 'needs-identity' && currentQuestion.identityStatus === 'unresolved'

  return (
    <>
      <section className={styles.hero}>
        <div>
          <span>Entrada de mercadoria · v10.1</span>
          <h1>Escanear nota de compra</h1>
          <p>Primeiro o sistema resolve todas as dúvidas de produto e embalagem. Só depois mostra a compra inteira para revisão e confirmação.</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.primary} onClick={() => setScanner('invoice')} disabled={phase === 'resolving'}><Camera />Escanear nota</button>
          <label className={styles.secondary}><FileUp />Importar XML<input hidden type="file" accept=".xml,text/xml,application/xml" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadXml(file); event.currentTarget.value = '' }} /></label>
        </div>
      </section>

      {phase === 'resolving' && <section className={styles.card}><h2>Identificando a compra…</h2><p>Verificando EAN, histórico do fornecedor, produtos deste mercado, catálogo e unidades de compra.</p></section>}

      {phase === 'questions' && currentQuestion && (
        <section className={styles.card}>
          <div className={styles.cardTitleRow}>
            <div>
              <span className={styles.eyebrow}>IDENTIFICAÇÃO DE PRODUTOS · Pendência {questionIndex} de {questionTotal}</span>
              <h2>A revisão completa aparece depois</h2>
              <p>Este item ainda precisa de uma decisão. Nenhum estoque será alterado agora.</p>
            </div>
            <button className={styles.iconButton} onClick={reset}><X /></button>
          </div>

          <div className={styles.identity}>
            <div className={styles.identityMedia}>{currentQuestion.imageUrl ? <img src={currentQuestion.imageUrl} alt="" /> : <Barcode />}</div>
            <div className={styles.grow}>
              <small>Na nota</small>
              <b>{currentQuestion.description}</b>
              <small>cProd {currentQuestion.supplierCode || '—'} · {qty(currentQuestion.quantityMilli)} {currentQuestion.purchaseUnit} · {money(currentQuestion.unitCostCents)}/{currentQuestion.purchaseUnit}</small>
              {currentQuestion.barcode && <><small>Produto relacionado</small><h3>{currentQuestion.name}</h3><small>EAN {currentQuestion.barcode} · {currentQuestion.source}</small></>}
              {currentQuestion.storeStatus === 'existing-priced' && <small>Já cadastrado neste mercado · venda {money(currentQuestion.salePriceCents)}</small>}
              {currentQuestion.storeStatus === 'existing-unpriced' && <small>Já cadastrado neste mercado · preço de venda pendente</small>}
            </div>
          </div>

          {currentQuestion.identityStatus === 'conflict' && <>
            <div className={styles.error}><AlertTriangle />O EAN desta NF-e não bate com a associação histórica deste fornecedor. Escolha explicitamente qual identidade usar.</div>
            <div className={styles.actions}>
              <button className={styles.primary} onClick={() => void useExplicitEanDespiteConflict(currentQuestion)}>Usar EAN desta NF-e</button>
              <button className={styles.secondary} onClick={() => void useHistoricalAlias(currentQuestion)}>Usar associação anterior</button>
              <button className={styles.secondary} onClick={() => rejectSuggestion(currentQuestion)}>Escolher outro produto</button>
            </div>
          </>}

          {currentQuestion.identityStatus === 'suggested' && <>
            <p><b>Esta é apenas uma sugestão.</b> Confirme antes de continuar.</p>
            <div className={styles.actions}>
              <button className={styles.primary} onClick={() => void acceptSuggestion(currentQuestion)}><Check />Sim, é este produto</button>
              <button className={styles.secondary} onClick={() => rejectSuggestion(currentQuestion)}>Não, corrigir</button>
            </div>
          </>}

          {currentQuestion.decisionState === 'needs-package-factor' && <>
            <h3>Quantas unidades existem em cada {currentQuestion.purchaseUnit}?</h3>
            <p>A nota informa {qty(currentQuestion.quantityMilli)} {currentQuestion.purchaseUnit}. Precisamos converter a embalagem para o estoque.</p>
            <label className={styles.fieldLabel}>1 {currentQuestion.purchaseUnit} contém quantas unidades?
              <input inputMode="decimal" value={packageFactorInput} onChange={(event) => setPackageFactorInput(event.target.value)} placeholder="Ex.: 6" />
            </label>
            {currentQuestion.packageFactor > 1 && <small>Sugestão extraída da descrição: {currentQuestion.packageFactor} unidades por {currentQuestion.purchaseUnit}. Confirme ou altere.</small>}
            <div className={styles.actions}><button className={styles.primary} onClick={() => void confirmPackageFactor(currentQuestion)}>Confirmar embalagem</button><button className={styles.secondary} onClick={() => excludeLine(currentQuestion)}>Não importar este item</button></div>
          </>}

          {unresolvedEditor && <>
            <h3>Produto não identificado</h3>
            <div className={styles.commercialGrid}>
              <label className={styles.fieldLabel}>Pesquisar produto conhecido<input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchProducts() }} /></label>
              <label className={styles.fieldLabel}>Digitar EAN<input inputMode="numeric" value={manualEan} onChange={(event) => setManualEan(event.target.value)} /></label>
            </div>
            <div className={styles.actions}>
              <button className={styles.secondary} onClick={() => void searchProducts()} disabled={searching}><Search />{searching ? 'Pesquisando…' : 'Pesquisar'}</button>
              <button className={styles.secondary} onClick={() => setScanner('question-item')}><Camera />Escanear EAN</button>
              <button className={styles.primary} onClick={() => void chooseBarcode(currentQuestion, manualEan)} disabled={!manualEan.trim()}>Usar EAN digitado</button>
              <button className={styles.secondary} onClick={() => excludeLine(currentQuestion)}>Não importar este item</button>
            </div>
            {searchResults.length > 0 && <div className={styles.productlist}>{searchResults.slice(0, 8).map((candidate) => <article className={styles.product} key={candidate.barcode}>
              <div className={styles.productPhoto}>{candidate.imageUrl ? <img src={candidate.imageUrl} alt="" /> : <Barcode />}</div>
              <div className={styles.grow}><b>{candidate.name}</b><small>{candidate.brand || 'Marca não informada'} · EAN {candidate.barcode}</small><small>{candidate.source || 'Catálogo'}</small></div>
              <button className={styles.editButton} onClick={() => void chooseBarcode(currentQuestion, candidate.barcode, candidate.source || 'Produto escolhido pelo usuário')}>Associar</button>
            </article>)}</div>}
          </>}
        </section>
      )}

      {phase === 'review' && invoice && pending.length === 0 && (
        <section className={styles.card}>
          <div className={styles.cardTitleRow}>
            <div>
              <span className={styles.eyebrow}>APROVAÇÃO FINAL · 0 pendências</span>
              <h2>NF-e {invoice.number || 'sem número'}</h2>
              <p>{invoice.supplierName || 'Fornecedor'} · {invoice.supplierDocument || 'documento não informado'}</p>
              {pendingPriceCount > 0 && <p><b>{pendingPriceCount} produto(s) ficarão com preço de venda pendente.</b> Isso não impede a entrada no estoque.</p>}
            </div>
            <button className={styles.iconButton} onClick={reset}><X /></button>
          </div>

          {learningWarning && <div className={styles.error}><AlertTriangle />Uma associação não pôde ser salva globalmente. A compra pode continuar, mas o sistema não vai afirmar que aprendeu aquela relação.</div>}

          <div className={styles.actions}>
            <button className={styles.secondary} onClick={() => setLines((current) => current.map((line) => ({ ...line, selected: line.decisionState === 'resolved' && Boolean(line.barcode) })))}>Selecionar todos os prontos</button>
            <button className={styles.secondary} onClick={() => setLines((current) => current.map((line) => ({ ...line, selected: false })))}>Desmarcar todos</button>
          </div>

          <div className={styles.invoiceList}>
            {lines.map((line) => <article className={styles.invoiceLine} key={`${line.line}-${line.supplierCode}`}>
              <input type="checkbox" checked={line.selected} disabled={line.decisionState === 'excluded'} onChange={(event) => updateLine(line.line, { selected: event.target.checked })} />
              <div className={styles.grow}>
                <b>{line.name}</b>
                <small>Nota: {line.description}</small>
                <small>{line.barcode ? `EAN ${line.barcode}` : `cProd ${line.supplierCode || '—'}`} · {line.source}</small>
                <small>Compra: {qty(line.quantityMilli)} {line.purchaseUnit}{line.packageFactor > 1 ? ` × ${line.packageFactor}` : ''} → estoque: {qty(line.stockQuantityMilli)} {line.inventoryUnit}</small>
                {line.decisionState === 'excluded' ? <small><b>NÃO SERÁ IMPORTADO</b></small> : line.storeStatus === 'existing-priced' ? <small>Venda atual: {money(line.salePriceCents)}</small> : <small><b>PREÇO DE VENDA PENDENTE</b></small>}
              </div>
              <div className={styles.invoiceNumber}><span>Custo compra</span><strong>{money(line.unitCostCents)}/{line.purchaseUnit}</strong></div>
              <div className={styles.invoiceNumber}><span>Custo estoque</span><strong>{money(line.inventoryUnitCostCents)}/{line.inventoryUnit}</strong></div>
              <div className={styles.invoiceNumber}><span>Total</span><strong>{money(line.totalCents)}</strong></div>
              {line.decisionState === 'excluded'
                ? <button className={styles.editButton} onClick={() => reopenExcluded(line)}>Reincluir</button>
                : <button className={styles.editButton} onClick={() => setEditingLine(line.line)}><Pencil />Editar</button>}
            </article>)}
          </div>

          <div className={styles.actions}>
            <button className={styles.primary} disabled={!selectedCount} onClick={() => { onCommit(invoice, importableInvoiceLines(lines)); reset() }}>CONFIRMAR ENTRADA — {selectedCount} ITENS</button>
            <button className={styles.secondary} onClick={reset}>Cancelar</button>
          </div>
        </section>
      )}

      {editLine && phase === 'review' && <section className={styles.card}>
        <div className={styles.cardTitleRow}><div><span className={styles.eyebrow}>Editar item da compra</span><h2>{editLine.name}</h2></div><button className={styles.iconButton} onClick={() => setEditingLine(null)}><X /></button></div>
        <div className={styles.commercialGrid}>
          <label className={styles.fieldLabel}>Produto / nome<input value={editLine.name} onChange={(event) => updateLine(editLine.line, { name: event.target.value })} /></label>
          <label className={styles.fieldLabel}>EAN / código<input inputMode="numeric" value={editLine.barcode} onChange={(event) => updateLine(editLine.line, { barcode: event.target.value.replace(/\D+/g, ''), resolution: 'manual', identityStatus: 'manual' })} /></label>
          <label className={styles.fieldLabel}>Descrição da nota<input value={editLine.description} onChange={(event) => updateLine(editLine.line, { description: event.target.value })} /></label>
          <label className={styles.fieldLabel}>Quantidade comprada<input inputMode="decimal" value={qty(editLine.quantityMilli)} onChange={(event) => { const value = numberValue(event.target.value); if (Number.isFinite(value) && value >= 0) updateLine(editLine.line, { quantityMilli: Math.round(value * 1000) }) }} /></label>
          <label className={styles.fieldLabel}>Custo unitário de compra<input inputMode="decimal" value={(editLine.unitCostCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} onChange={(event) => { const value = numberValue(event.target.value); if (Number.isFinite(value) && value >= 0) updateLine(editLine.line, { unitCostCents: Math.round(value * 100) }) }} /></label>
          {requiresPackageFactor(editLine.purchaseUnit) && <label className={styles.fieldLabel}>Unidades por {editLine.purchaseUnit}<input inputMode="decimal" value={String(editLine.packageFactor || '')} onChange={(event) => { const value = numberValue(event.target.value); if (Number.isFinite(value) && value > 0) updateLine(editLine.line, { packageFactor: value }) }} /></label>}
        </div>
        <div className={styles.actions}>
          <button className={styles.primary} onClick={() => { const latest = lines.find((line) => line.line === editLine.line); if (latest) void saveAlias(editInvoiceReviewLine(latest, { decisionState: 'resolved', confirmed: true })); setEditingLine(null) }}>Salvar item</button>
          <button className={styles.secondary} onClick={() => setScanner('edit-item')}><Camera />Escanear EAN</button>
        </div>
      </section>}

      <section className={styles.card}><p><b>Fallback:</b> para NF-e real cuja recuperação oficial ainda não esteja autorizada, o XML continua disponível.</p></section>

      {scanner && <QuaggaScanner
        onCode={(code) => {
          if (scanner === 'invoice') return void scanInvoiceKey(code)
          if (scanner === 'question-item' && currentQuestion) return void chooseBarcode(currentQuestion, code, 'EAN escaneado da embalagem')
          if (scanner === 'edit-item' && editLine) return void chooseBarcode(editLine, code, 'EAN corrigido no editor')
          setScanner(null)
        }}
        close={() => setScanner(null)}
      />}
    </>
  )
}
