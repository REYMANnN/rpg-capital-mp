export type ScaleMode = 'weight' | 'price'

export interface ScaleRule {
  prefix: string
  productDigits: number
  valueDigits: number
  mode: ScaleMode
  decimalPlaces: number
}

export interface Product {
  id: string
  barcode: string
  scaleCode?: string
  name: string
  priceCents: number
  stockMilli: number
  minStockMilli: number
}

export interface CartInput {
  productId: string
  quantityMilli: number
}

export interface SaleItem {
  productId: string
  quantityMilli: number
  unitPriceCents: number
  lineTotalCents: number
}

export interface Sale {
  id: string
  createdAt: string
  totalCents: number
  items: SaleItem[]
}

export type ScanResult =
  | { kind: 'barcode'; code: string }
  | { kind: 'scale'; productCode: string; encodedValue: number; quantity?: number; encodedPriceCents?: number }

export function parseScaleLabel(code: string, rule: ScaleRule): ScanResult {
  const normalized = code.trim()
  if (!normalized.startsWith(rule.prefix)) return { kind: 'barcode', code: normalized }

  const start = rule.prefix.length
  const productEnd = start + rule.productDigits
  const valueEnd = productEnd + rule.valueDigits
  if (normalized.length < valueEnd) return { kind: 'barcode', code: normalized }

  const productCode = normalized.slice(start, productEnd)
  const valueText = normalized.slice(productEnd, valueEnd)
  if (!/^\d+$/.test(productCode) || !/^\d+$/.test(valueText)) return { kind: 'barcode', code: normalized }

  const encodedValue = Number(valueText)
  if (rule.mode === 'weight') {
    return {
      kind: 'scale',
      productCode,
      encodedValue,
      quantity: encodedValue / 10 ** rule.decimalPlaces,
    }
  }
  return {
    kind: 'scale',
    productCode,
    encodedValue,
    encodedPriceCents: Math.round((encodedValue / 10 ** rule.decimalPlaces) * 100),
  }
}

export function completeSale(products: Product[], lines: CartInput[], saleId: string) {
  if (!lines.length) throw new Error('Adicione pelo menos um produto à venda.')
  const quantities = new Map<string, number>()
  for (const line of lines) {
    if (!Number.isInteger(line.quantityMilli) || line.quantityMilli <= 0) throw new Error('Quantidade inválida.')
    quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantityMilli)
  }

  const byId = new Map(products.map((p) => [p.id, p]))
  for (const [productId, quantityMilli] of quantities) {
    const product = byId.get(productId)
    if (!product) throw new Error('Produto não encontrado.')
    if (product.stockMilli < quantityMilli) throw new Error(`Estoque insuficiente para ${product.name}.`)
  }

  const items: SaleItem[] = [...quantities].map(([productId, quantityMilli]) => {
    const product = byId.get(productId)!
    return {
      productId,
      quantityMilli,
      unitPriceCents: product.priceCents,
      lineTotalCents: Math.round(product.priceCents * quantityMilli / 1000),
    }
  })

  const nextProducts = products.map((product) => ({
    ...product,
    stockMilli: product.stockMilli - (quantities.get(product.id) ?? 0),
  }))

  return {
    products: nextProducts,
    sale: {
      id: saleId,
      createdAt: new Date().toISOString(),
      totalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
      items,
    } satisfies Sale,
  }
}
