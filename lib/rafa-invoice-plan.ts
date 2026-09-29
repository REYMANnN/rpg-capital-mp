import type { RafaChange, RafaStoreState } from '@/lib/inventory/rafa-store'
import type { RafaProductResolution } from '@/lib/rafa-products'
import { isValidGtin } from '@/lib/whatsapp-router'

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

export function buildInvoicePlan(state: RafaStoreState, lines: InvoicePlanLine[]): InvoicePlan {
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

export function invoicePlanMessage(plan: InvoicePlan, supplier: string | null, reviewLink?: string) {
  const total = plan.entradas.length + plan.novos.length + plan.duvidas.length
  if (!total) {
    return `Reconheci a nota${supplier ? ` de ${supplier}` : ''}, mas não consegui ler os itens. Me manda uma foto mais de perto, reta e com boa luz (pode ser em 2 partes), ou o PDF/XML da nota.`
  }
  const lines = [`Li a nota${supplier ? ` de ${supplier}` : ''}: ${total} produto(s).`]
  if (plan.entradas.length) lines.push(`• ${plan.entradas.length} já são da loja: dou entrada no estoque com o custo da nota`)
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
  if (plan.entradas.length) lines.push('', `Confirma a entrada dos ${plan.entradas.length}?`)
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
