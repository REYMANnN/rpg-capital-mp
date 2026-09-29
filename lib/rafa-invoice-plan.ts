import type { RafaChange, RafaStoreState } from '@/lib/inventory/rafa-store'
import type { RafaProductResolution } from '@/lib/rafa-products'

// Dígito verificador de EAN-8/12/13/14 (cópia local: módulo puro, testável sem o Next).
function isValidGtin(value: string) {
  const digits = String(value || '').replace(/\D/g, '')
  if (![8, 12, 13, 14].includes(digits.length) || digits !== String(value || '').trim()) return false
  const nums = digits.split('').map(Number)
  const check = nums.pop()!
  const sum = nums.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

// Nota fiscal → estoque, sem tela: o que já é da loja vira entrada (Sim/Não),
// o que é novo e tem EAN espera só o preço de venda do lojista, e o resto vai para conferência.
// Regra fixa: quantidade e custo vêm da nota; preço de venda só do lojista.

export type InvoicePlanLine = {
  description?: string | null
  ean?: string | null
  quantity?: number | null
  unit_cost_cents?: number | null
  unit_package?: string | null
  supplier_code?: string | null
  // o que falta no nome para achar o produto (preenchido pela busca por nome)
  missing?: string | null
  check_reasons?: string[] | null
  confidence?: { product?: number; quantity?: number; cost?: number } | null
  resolution?: RafaProductResolution | null
}

export type PendingNewProduct = {
  barcode: string
  name: string
  brand: string
  quantityMilli: number
  costCents: number
  unit?: 'UN' | 'KG'
  supplierCode?: string | null
}

export type InvoiceDoubt = { description: string; reason: string }

export type InvoicePlan = {
  entradas: Extract<RafaChange, { kind: 'entrada' }>[]
  novos: PendingNewProduct[]
  duvidas: InvoiceDoubt[]
}

const MIN_CONFIDENCE = 0.85

const isKg = (value?: string | null) => /^\s*(kg|quilo|kilo)/i.test(String(value || ''))

// "ARROZ TIPO 1 5KG" → "Arroz Tipo 1 5kg"
function niceName(value: string) {
  return value.toLowerCase().replace(/(^|\s)(\S)/g, (_, space, char) => space + char.toUpperCase())
    .replace(/(\d)(Kg|G|Ml|L|Un)\b/g, (_, digit, unit) => digit + unit.toLowerCase()).slice(0, 120)
}

// ---------- Rafa 3.0: toda linha da nota termina em "entrou" ou "novo esperando preço" ----------

const STOP = new Set(['de', 'da', 'do', 'com', 'sem', 'tipo', 't1', 'tp', 'trad', 'tradicional', 'pet', 'un', 'und', 'cx', 'pct', 'fd'])
function tokens(value: string) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').split(' ').filter((token) => token.length >= 3 && !STOP.has(token) && !/^\d+(g|kg|ml|l|m)?$/.test(token))
}

// O nome achado no catálogo é mesmo o produto da nota? (evita "LEITE ITALAC" virar "Leite Condensado Moça")
export function sameProductName(description: string, candidate: string) {
  const wanted = tokens(description)
  if (!wanted.length) return true
  const have = new Set(tokens(candidate))
  const hits = wanted.filter((token) => [...have].some((word) => word.startsWith(token.slice(0, 4)) || token.startsWith(word.slice(0, 4))))
  return hits.length / wanted.length >= 0.6
}

function checkDigit(body: string) {
  const sum = body.split('').reverse().reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0)
  return String((10 - (sum % 10)) % 10)
}

// Código interno (EAN-13 com prefixo 04, de uso restrito da loja) para produto sem código de barras
// na nota. O mesmo nome gera sempre o mesmo código, então a próxima nota acha o produto.
export function internalBarcodeFor(description: string) {
  const key = tokens(description).join(' ') || String(description).toLowerCase()
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  const body = `04${String(hash % 10_000_000_000).padStart(10, '0')}`
  return body + checkDigit(body)
}

// Tamanho em g/ml ("2L" → 2000, "397G" → 397, "1,033kg" → 1033). null se não disser.
function sizeOf(value: string) {
  const match = String(value || '').toLowerCase().replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/)
  if (!match) return null
  const amount = Number(match[1])
  return match[2] === 'kg' || match[2] === 'l' ? Math.round(amount * 1000) : Math.round(amount)
}

// Produto da loja achado para a linha da nota é plausível? Mesmo tipo (1ª palavra) e mesmo tamanho.
export function plausibleStoreMatch(description: string, productName: string) {
  const first = tokens(description)[0]
  const name = tokens(productName).join(' ')
  if (first && !name.includes(first.slice(0, Math.min(4, first.length)))) return false
  const a = sizeOf(description)
  const b = sizeOf(productName)
  return a === null || b === null || a === b
}

// Nome + tamanho: "Ketchup Heinz 397g" ≠ "Ketchup Heinz 1,033kg".
function normalizedName(value: string) {
  return `${tokens(value).join(' ')}|${sizeOf(value) ?? ''}`
}

export function buildInvoicePlan(state: RafaStoreState, lines: InvoicePlanLine[], options?: { lenient?: boolean }): InvoicePlan {
  if (options?.lenient) return buildLenientInvoicePlan(state, lines)
  const plan: InvoicePlan = { entradas: [], novos: [], duvidas: [] }
  const byId = new Map(state.products.filter((product) => !product.deletedAt).map((product) => [product.id, product]))
  const entradas = new Map<string, { quantityMilli: number; totalCostCents: number }>()
  const novos = new Map<string, PendingNewProduct>()

  for (const line of lines) {
    const description = String(line.description || line.ean || 'item sem nome').trim().slice(0, 120)
    const confidence = line.confidence || {}
    const checkReasons = Array.isArray(line.check_reasons) ? line.check_reasons : []
    if (checkReasons.length) {
      const reason = checkReasons.includes('valor_nao_confere') || checkReasons.includes('valor_incompleto') ? 'valor não confere'
        : checkReasons.includes('ean_invalido') ? 'código da nota não confere'
          : checkReasons.includes('descricao_curta') ? 'descrição ilegível'
            : 'linha da nota precisa de conferência'
      plan.duvidas.push({ description, reason })
      continue
    }
    const quantityMilli = Math.round(Number(line.quantity || 0) * 1000)
    const costCents = Math.round(Number(line.unit_cost_cents || 0))
    if (!(quantityMilli > 0) || Number(confidence.quantity ?? 1) < MIN_CONFIDENCE) {
      plan.duvidas.push({ description, reason: 'não li a quantidade' })
      continue
    }
    if (!(costCents > 0) || Number(confidence.cost ?? 1) < MIN_CONFIDENCE) {
      plan.duvidas.push({ description, reason: 'não li o custo' })
      continue
    }
    const resolution = line.resolution
    const sure = Number(confidence.product ?? 1) >= MIN_CONFIDENCE

    if (resolution?.status === 'resolved' && resolution.candidate.id && byId.has(resolution.candidate.id) && sure) {
      const current = entradas.get(resolution.candidate.id) || { quantityMilli: 0, totalCostCents: 0 }
      current.quantityMilli += quantityMilli
      current.totalCostCents += costCents * quantityMilli / 1000
      entradas.set(resolution.candidate.id, current)
      continue
    }

    if (resolution?.status === 'new' && isValidGtin(resolution.candidate.barcode)) {
      const barcode = resolution.candidate.barcode
      const current = novos.get(barcode)
      if (current) {
        const total = current.costCents * current.quantityMilli + costCents * quantityMilli
        current.quantityMilli += quantityMilli
        current.costCents = Math.round(total / current.quantityMilli)
      } else {
        novos.set(barcode, {
          barcode,
          name: String(resolution.candidate.name || description).slice(0, 120),
          brand: String(resolution.candidate.brand || ''),
          quantityMilli,
          costCents,
          unit: isKg(line.unit_package) ? 'KG' : 'UN',
          supplierCode: line.supplier_code || null,
        })
      }
      continue
    }

    // Código de barras válido que não está em nenhum catálogo: a própria nota dá o nome.
    const ean = String(line.ean || '').replace(/\D/g, '')
    const inStore = state.products.some((product) => product.barcode === ean && !product.deletedAt)
    if (resolution?.status !== 'ambiguous' && isValidGtin(ean) && !inStore && sure) {
      const current = novos.get(ean)
      if (current) {
        const total = current.costCents * current.quantityMilli + costCents * quantityMilli
        current.quantityMilli += quantityMilli
        current.costCents = Math.round(total / current.quantityMilli)
      } else {
        novos.set(ean, { barcode: ean, name: niceName(description), brand: '', quantityMilli, costCents, unit: isKg(line.unit_package) ? 'KG' : 'UN', supplierCode: line.supplier_code || null })
      }
      continue
    }

    plan.duvidas.push({
      description,
      reason: line.missing === 'nao_encontrado' ? 'não achei no catálogo'
        : line.missing === 'sem_marca' ? 'nota sem marca'
          : line.missing === 'tamanho' ? 'falta tamanho'
            : resolution?.status === 'ambiguous' ? 'mais de um produto parecido'
              : ean ? 'código não reconhecido' : 'não achei no catálogo',
    })
  }

  for (const [productId, entry] of entradas) {
    const product = byId.get(productId)!
    plan.entradas.push({
      kind: 'entrada',
      productId,
      expectedStockMilli: product.stockMilli,
      quantityMilli: entry.quantityMilli,
      unitCostCents: Math.max(1, Math.round(entry.totalCostCents * 1000 / entry.quantityMilli)),
      reason: 'nota fiscal',
    })
  }
  plan.novos = [...novos.values()]
  return plan
}

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const units = (milli: number) => (milli / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

export function invoicePlanMessage(plan: InvoicePlan, supplier: string | null, reviewLink?: string, applied = false) {
  const total = plan.entradas.length + plan.novos.length + plan.duvidas.length
  if (!total) {
    return `Reconheci a nota${supplier ? ` de ${supplier}` : ''}, mas não consegui ler os itens. Me manda uma foto mais de perto, reta e com boa luz (pode ser em 2 partes), ou o PDF/XML da nota.`
  }
  const lines = [`Li a nota${supplier ? ` de ${supplier}` : ''}: ${total} produto(s).`]
  if (plan.entradas.length) lines.push(applied
    ? `• ${plan.entradas.length} já são da loja: já dei entrada no estoque com o custo da nota`
    : `• ${plan.entradas.length} já são da loja: dou entrada no estoque com o custo da nota`)
  if (plan.novos.length) lines.push(`• ${plan.novos.length} novo(s): já te pergunto o preço de venda de cada um`)
  if (plan.duvidas.length) {
    const groups = new Map<string, string[]>()
    for (const doubt of plan.duvidas) {
      const list = groups.get(doubt.reason) || []
      list.push(doubt.description)
      groups.set(doubt.reason, list)
    }
    for (const [reason, descriptions] of groups) {
      const shown = descriptions.slice(0, 3).join(', ')
      lines.push(`• ${reason}: ${shown}${descriptions.length > 3 ? '…' : ''}`)
    }
    if (reviewLink) lines.push(`  Confere aqui: ${reviewLink}`)
  }
  if (plan.entradas.length && !applied) lines.push('', `Confirma a entrada dos ${plan.entradas.length}?`)
  if (plan.entradas.length && applied) lines.push('', 'Se algo não bater, é só falar "desfaz".')
  return lines.join('\n')
}

export type PendingProductRow = {
  barcode: string
  name: string
  quantity_milli: number
  cost_cents: number
  unit?: string
}

export function priceRequestMessage(rows: PendingProductRow[]) {
  if (!rows.length) return ''
  const list = rows.slice(0, 15).map((row, index) =>
    `${index + 1}. ${row.name} — custo ${money(Number(row.cost_cents))}${row.unit === 'KG' ? '/kg' : ''} · ${units(Number(row.quantity_milli))} ${row.unit === 'KG' ? 'kg' : 'un.'}`)
  const more = rows.length > 15 ? `\n(+${rows.length - 15} depois desses)` : ''
  return [
    rows.length === 1 ? 'Só falta o preço de venda desse produto novo:' : `Só falta o preço de venda de ${rows.length} produtos novos:`,
    ...list,
    more,
    'Responde do jeito mais fácil: escreve (ex.: "1 27,90") ou manda um áudio falando os preços.',
  ].filter(Boolean).join('\n')
}

// Bloco para o agente: produtos da nota esperando preço (custo e quantidade já vêm da nota).
export function pendingProductsBlock(rows: PendingProductRow[]) {
  if (!rows.length) return ''
  return [
    `PRODUTOS NOVOS DA NOTA ESPERANDO PREÇO DE VENDA (${rows.length}). Colunas: nº | nome | EAN | custo | quantidade`,
    ...rows.slice(0, 40).map((row, index) => [index + 1, row.name, row.barcode, money(Number(row.cost_cents)), units(Number(row.quantity_milli))].join(' | ')),
    'Quando o lojista disser os preços (por número ou nome, texto ou áudio), chame propor_alteracoes com tipo cadastrar para cada um: ean e nome desta lista, preco_reais que ELE falou, custo_reais e estoque_inicial desta lista. Nunca sugira nem invente preço de venda; se faltar o preço de algum, pergunte só esse.',
  ].join('\n')
}

function buildLenientInvoicePlan(state: RafaStoreState, lines: InvoicePlanLine[]): InvoicePlan {
  const plan: InvoicePlan = { entradas: [], novos: [], duvidas: [] }
  const active = state.products.filter((product) => !product.deletedAt)
  const byId = new Map(active.map((product) => [product.id, product]))
  const byBarcode = new Map(active.map((product) => [product.barcode, product]))
  const byName = new Map(active.map((product) => [normalizedName(product.name), product]))
  const entradas = new Map<string, { quantityMilli: number; totalCostCents: number }>()
  const novos = new Map<string, PendingNewProduct>()

  const addEntrada = (productId: string, quantityMilli: number, costCents: number) => {
    const current = entradas.get(productId) || { quantityMilli: 0, totalCostCents: 0 }
    current.quantityMilli += quantityMilli
    current.totalCostCents += costCents * quantityMilli / 1000
    entradas.set(productId, current)
  }
  const addNovo = (barcode: string, name: string, brand: string, quantityMilli: number, costCents: number, line: InvoicePlanLine) => {
    const current = novos.get(barcode)
    if (current) {
      const total = current.costCents * current.quantityMilli + costCents * quantityMilli
      current.quantityMilli += quantityMilli
      current.costCents = current.quantityMilli ? Math.round(total / current.quantityMilli) : costCents
      return
    }
    novos.set(barcode, { barcode, name: name.slice(0, 120), brand, quantityMilli, costCents, unit: isKg(line.unit_package) ? 'KG' : 'UN', supplierCode: line.supplier_code || null })
  }

  for (const line of lines) {
    const description = String(line.description || '').trim().slice(0, 120)
    const ean = String(line.ean || '').replace(/\D/g, '')
    if (!description && !isValidGtin(ean)) {
      plan.duvidas.push({ description: 'linha sem nome', reason: 'linha ilegível' })
      continue
    }
    // Quantidade e custo: usa o que foi lido; se faltar um, calcula pelo total da linha.
    let quantity = Number(line.quantity || 0)
    let unitCost = Math.round(Number(line.unit_cost_cents || 0))
    const total = Math.round(Number((line as { total_cents?: number }).total_cents || 0))
    if (!(unitCost > 0) && total > 0 && quantity > 0) unitCost = Math.round(total / quantity)
    if (!(quantity > 0) && total > 0 && unitCost > 0) quantity = Math.round((total / unitCost) * 1000) / 1000
    const quantityMilli = Math.max(0, Math.round(quantity * 1000))
    const costCents = Math.max(0, unitCost)

    const resolution = line.resolution
    // 1) Já é da loja: pelo produto resolvido, pelo EAN ou pelo mesmo nome de uma nota anterior.
    const resolvedId = resolution?.status === 'resolved' && resolution.candidate.id && byId.has(resolution.candidate.id) ? resolution.candidate.id : null
    const resolvedProduct = resolvedId ? byId.get(resolvedId) : undefined
    const storeMatch = [
      resolvedProduct,
      isValidGtin(ean) ? byBarcode.get(ean) : undefined,
      byName.get(normalizedName(niceName(description))),
      byBarcode.get(internalBarcodeFor(description)),
    ].find((product) => product && plausibleStoreMatch(description, product.name))
    if (storeMatch) {
      const cost = costCents || Math.round(storeMatch.averageCostCents || 0)
      if (quantityMilli > 0 && cost > 0) addEntrada(storeMatch.id, quantityMilli, cost)
      else plan.duvidas.push({ description: storeMatch.name, reason: 'a quantidade não aparece na foto' })
      continue
    }
    // 2) Produto novo: EAN do catálogo (se o nome bater), EAN da nota ou código interno.
    const candidate = resolution?.status === 'new' && isValidGtin(resolution.candidate.barcode)
      && ((resolution.candidate as { source?: string }).source === 'name_ean' || sameProductName(description, String(resolution.candidate.name || '')))
      ? resolution.candidate : null
    if (candidate) {
      addNovo(candidate.barcode, String(candidate.name || niceName(description)), String(candidate.brand || ''), quantityMilli, costCents, line)
    } else if (isValidGtin(ean) && !byBarcode.has(ean)) {
      addNovo(ean, niceName(description), '', quantityMilli, costCents, line)
    } else {
      addNovo(internalBarcodeFor(description), niceName(description), '', quantityMilli, costCents, line)
    }
  }

  for (const [productId, entry] of entradas) {
    const product = byId.get(productId)!
    plan.entradas.push({
      kind: 'entrada',
      productId,
      expectedStockMilli: product.stockMilli,
      quantityMilli: entry.quantityMilli,
      unitCostCents: Math.max(1, Math.round(entry.totalCostCents * 1000 / entry.quantityMilli)),
      reason: 'nota fiscal',
    })
  }
  plan.novos = [...novos.values()]
  return plan
}

// Resumo da nota na Rafa 3.0: só o que foi feito e o que ficou na lista (nada de "problemas").
export function invoiceResultMessage(state: RafaStoreState, plan: InvoicePlan, supplier: string | null) {
  const names = new Map(state.products.map((product) => [product.id, product.name]))
  const total = plan.entradas.length + plan.novos.length + plan.duvidas.length
  if (!total) return `Não consegui ler os itens dessa nota${supplier ? ` de ${supplier}` : ''}. Me manda uma foto mais de perto, reta e com boa luz (pode ser em partes), ou o PDF/XML.`
  const lines = [`Li a nota${supplier ? ` de ${supplier}` : ''}: ${total} produto(s).`]
  if (plan.entradas.length) {
    const shown = plan.entradas.slice(0, 6).map((entry) => `${names.get(entry.productId) || 'produto'} +${units(entry.quantityMilli)}`)
    lines.push(`• ${plan.entradas.length} já eram da loja e entraram no estoque: ${shown.join(', ')}${plan.entradas.length > 6 ? '…' : ''}`)
  }
  if (plan.novos.length) lines.push(`• ${plan.novos.length} são novos e ficaram na sua lista esperando o preço de venda (te mando a lista agora).`)
  if (plan.duvidas.length) lines.push(`• ${plan.duvidas.length} sem quantidade legível: ${plan.duvidas.slice(0, 3).map((doubt) => doubt.description).join(', ')}. Me fala a quantidade que eu lanço.`)
  if (plan.entradas.length) lines.push('', 'Se algo não bater, é só falar "desfaz".')
  return lines.join('\n')
}
