import { randomUUID } from 'node:crypto'

import type { RafaChange, RafaStoreState } from '@/lib/inventory/rafa-store'
import { isValidGtin } from '@/lib/whatsapp-router'

// Planilhas (xlsx/csv) mandadas no WhatsApp: acha as colunas, compara com a loja
// e monta as alterações para o lojista confirmar com Sim/Não. Sem IA: regras fixas.

export type Table = string[][]

export type ColumnMap = {
  nome?: number
  ean?: number
  preco?: number
  custo?: number
  estoque?: number
  quantidade?: number
  unidade?: number
}

const HEADER_RULES: Array<[keyof ColumnMap, RegExp]> = [
  ['ean', /^(ean|gtin|codigo de barras|cod(igo)? barras|cod\.? barras|barcode|ean13|ean 13)$/],
  ['nome', /^(nome|produto|descricao|descricao do produto|item|nome do produto|mercadoria)$/],
  ['preco', /^(preco|preco de venda|preco venda|venda|valor de venda|valor venda|pv|preco unitario|valor)$/],
  ['custo', /^(custo|preco de custo|custo unitario|valor de custo|custo medio|compra|preco de compra)$/],
  ['estoque', /^(estoque|saldo|estoque atual|qtd em estoque|quantidade em estoque|qtd estoque)$/],
  ['quantidade', /^(quantidade|qtd|qtde|quant|qt)$/],
  ['unidade', /^(unidade|un|und|unid|medida)$/],
]

export function normalizeHeader(value: string) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(r\$\)|r\$|\(.*?\)/g, ' ')
    .replace(/[^a-z0-9. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function detectColumns(header: string[]): ColumnMap {
  const map: ColumnMap = {}
  header.forEach((cell, index) => {
    const name = normalizeHeader(cell)
    if (!name) return
    for (const [key, rule] of HEADER_RULES) {
      if (map[key] === undefined && rule.test(name)) { map[key] = index; return }
    }
  })
  return map
}

// Acha a linha de cabeçalho nas 10 primeiras (planilha pode ter título em cima).
export function findHeader(rows: Table): { index: number; map: ColumnMap } | null {
  for (let index = 0; index < Math.min(rows.length, 10); index += 1) {
    const map = detectColumns(rows[index] || [])
    const hasKey = map.nome !== undefined || map.ean !== undefined
    const hasValue = map.preco !== undefined || map.custo !== undefined || map.estoque !== undefined || map.quantidade !== undefined
    if (hasKey && hasValue) return { index, map }
  }
  return null
}

// "R$ 1.234,56" / "12,5" / "12.50" / 12.5 → número
export function parseNumberBR(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let text = String(value ?? '').trim().replace(/r\$\s*/i, '').replace(/\s+/g, '')
  if (!text) return null
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.')
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

export function parseCsv(text: string): Table {
  // Separador: o que mais aparece nas primeiras linhas (pode ter título sem separador em cima).
  const sample = text.split(/\r?\n/).slice(0, 8).join('\n')
  const count = (char: string) => sample.split(char).length - 1
  const delimiter = [';', '\t', ','].reduce((best, char) => count(char) > count(best) ? char : best, ',')
  const rows: Table = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1 }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === delimiter) { row.push(cell); cell = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((line) => line.some((value) => value.trim()))
}

export function tableToText(rows: Table, maxRows = 150, maxChars = 10_000) {
  const lines: string[] = []
  let size = 0
  for (const row of rows.slice(0, maxRows)) {
    const line = row.map((cell) => String(cell ?? '').replace(/\s+/g, ' ').trim()).join(' | ')
    if (size + line.length > maxChars) break
    lines.push(line)
    size += line.length + 1
  }
  const cut = rows.length > lines.length ? `\n(... mais ${rows.length - lines.length} linhas não mostradas)` : ''
  return lines.join('\n') + cut
}

export type ImportSkip = { line: number; name: string; reason: string }
export type ImportPlan = {
  changes: RafaChange[]
  newProducts: number
  priceUpdates: number
  stockUpdates: number
  entries: number
  unchanged: number
  skipped: ImportSkip[]
  rows: number
}

const cents = (value: number | null) => value === null ? null : Math.round(value * 100)
const milli = (value: number | null) => value === null ? null : Math.round(value * 1000)

// mode 'set': coluna de quantidade é o estoque atual. mode 'entrada': quantidade que chegou (soma).
export function buildImportPlan(state: RafaStoreState, rows: Table, header: { index: number; map: ColumnMap }, mode: 'set' | 'entrada' = 'set'): ImportPlan {
  const { map } = header
  const plan: ImportPlan = { changes: [], newProducts: 0, priceUpdates: 0, stockUpdates: 0, entries: 0, unchanged: 0, skipped: [], rows: 0 }
  const active = state.products.filter((product) => !product.deletedAt)
  const byBarcode = new Map(active.map((product) => [product.barcode, product]))
  const byName = new Map(active.map((product) => [normalizeHeader(product.name), product]))
  const seen = new Set<string>()
  const stockColumn = map.estoque ?? (mode === 'set' ? map.quantidade : undefined)
  const entryColumn = mode === 'entrada' ? (map.quantidade ?? map.estoque) : undefined

  rows.slice(header.index + 1).forEach((row, offset) => {
    const line = header.index + offset + 2
    const cell = (index?: number) => index === undefined ? '' : String(row[index] ?? '').trim()
    const name = cell(map.nome).slice(0, 120)
    const barcode = cell(map.ean).replace(/\D/g, '')
    if (!name && !barcode) return
    plan.rows += 1

    const price = cents(parseNumberBR(cell(map.preco)))
    const cost = cents(parseNumberBR(cell(map.custo)))
    const stock = stockColumn === undefined ? null : milli(parseNumberBR(cell(stockColumn)))
    const entry = entryColumn === undefined ? null : milli(parseNumberBR(cell(entryColumn)))
    const unit = /^(kg|quilo|kilo)/i.test(cell(map.unidade)) ? 'KG' : 'UN'

    const product = (barcode && byBarcode.get(barcode)) || (name ? byName.get(normalizeHeader(name)) : undefined)
    const key = product?.id || barcode || normalizeHeader(name)
    if (seen.has(key)) { plan.skipped.push({ line, name: name || barcode, reason: 'repetido na planilha' }); return }
    seen.add(key)

    if (product) {
      let changed = false
      if (price !== null && price > 0 && price !== product.priceCents) {
        plan.changes.push({ kind: 'preco', productId: product.id, expectedPriceCents: product.priceCents, newPriceCents: price })
        plan.priceUpdates += 1
        changed = true
      }
      if (entry !== null && entry > 0) {
        const unitCost = cost !== null && cost > 0 ? cost : Math.round(product.averageCostCents || 0)
        if (unitCost > 0) {
          plan.changes.push({ kind: 'entrada', productId: product.id, expectedStockMilli: product.stockMilli, quantityMilli: entry, unitCostCents: unitCost })
          plan.entries += 1
          changed = true
        } else {
          plan.skipped.push({ line, name: product.name, reason: 'entrada sem custo' })
          return
        }
      } else if (stock !== null && stock >= 0 && stock !== product.stockMilli) {
        plan.changes.push({ kind: 'estoque', productId: product.id, expectedStockMilli: product.stockMilli, newStockMilli: stock })
        plan.stockUpdates += 1
        changed = true
      }
      if (!changed) plan.unchanged += 1
      return
    }

    // Produto novo: precisa de EAN válido, nome, preço e custo (mesma regra do cadastro no Balcão).
    if (!isValidGtin(barcode)) { plan.skipped.push({ line, name: name || barcode, reason: barcode ? 'código de barras inválido' : 'sem código de barras' }); return }
    if (!name) { plan.skipped.push({ line, name: barcode, reason: 'sem nome' }); return }
    if (!(price && price > 0)) { plan.skipped.push({ line, name, reason: 'sem preço de venda' }); return }
    if (!(cost && cost > 0)) { plan.skipped.push({ line, name, reason: 'sem custo' }); return }
    const deleted = state.products.find((item) => item.barcode === barcode && item.deletedAt)
    plan.changes.push({
      kind: 'cadastrar',
      productId: deleted?.id || randomUUID(),
      barcode,
      name,
      unit,
      priceCents: price,
      costCents: cost,
      stockMilli: Math.max(0, (entry ?? stock ?? 0) || 0),
      reactivate: Boolean(deleted),
    })
    plan.newProducts += 1
  })
  return plan
}

export function importSummaryMessage(plan: ImportPlan, filename: string) {
  const lines = [`Li a planilha ${filename}: ${plan.rows} produto(s).`]
  if (plan.newProducts) lines.push(`• Cadastrar ${plan.newProducts} produto(s) novo(s)`)
  if (plan.priceUpdates) lines.push(`• Mudar o preço de ${plan.priceUpdates}`)
  if (plan.stockUpdates) lines.push(`• Acertar o estoque de ${plan.stockUpdates}`)
  if (plan.entries) lines.push(`• Dar entrada em ${plan.entries}`)
  if (plan.unchanged) lines.push(`• ${plan.unchanged} já estão iguais na loja`)
  if (plan.skipped.length) {
    const examples = plan.skipped.slice(0, 4).map((skip) => `${skip.name} (linha ${skip.line}: ${skip.reason})`).join('; ')
    lines.push(`• Vou pular ${plan.skipped.length}: ${examples}${plan.skipped.length > 4 ? '…' : ''}`)
  }
  if (plan.changes.length) {
    const preview = plan.changes.slice(0, 5).map((change) => change.kind === 'cadastrar' ? `novo: ${change.name}` : null).filter(Boolean)
    if (preview.length) lines.push(`Exemplos: ${preview.join(', ')}`)
    lines.push('', 'Quer que eu faça essas alterações?')
  }
  return lines.join('\n')
}
