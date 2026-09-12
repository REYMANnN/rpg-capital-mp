import type { Sale, ScaleRule } from '@/lib/inventory/core'
import { buildFinanceDashboard, type FinanceTransactionInput } from '@/lib/finance/dashboard'

export const DEMO_STORAGE_KEY = 'balcao-demo-session-v1'
export const DEMO_INVENTORY_STORAGE_KEY = 'rpg-inventory-v1-2026'

export type DemoProduct = {
  id: string
  barcode: string
  name: string
  unit: 'UN' | 'KG'
  priceCents: number
  stockMilli: number
  minStockMilli: number
  averageCostCents: number
  catalogSource?: string
  catalogBrand?: string
  catalogImageUrl?: string
  deletedAt?: string
}

export type DemoMovement = {
  id: string
  productId: string
  type: 'initial' | 'purchase' | 'sale' | 'adjustment'
  quantityMilli: number
  createdAt: string
  note: string
  supplierDocument?: string
  supplierName?: string
  invoiceKey?: string
  invoiceNumber?: string
}

export type DemoStoreData = {
  products: DemoProduct[]
  sales: Sale[]
  movements: DemoMovement[]
  scaleRule: ScaleRule
}

const SCALE_RULE: ScaleRule = { prefix: '', productDigits: 0, valueDigits: 0, mode: 'weight', decimalPlaces: 0 }

const PRODUCT_SEED: Array<Omit<DemoProduct, 'id'>> = [
  { barcode: '7891000100103', name: 'Leite Condensado Integral Moça', unit: 'UN', priceCents: 1000, stockMilli: 36000, minStockMilli: 8000, averageCostCents: 500, catalogSource: 'Catálogo BALCÃO', catalogBrand: 'Moça' },
  { barcode: '7891022638004', name: 'Detergente Limpol', unit: 'UN', priceCents: 549, stockMilli: 10000, minStockMilli: 6000, averageCostCents: 250, catalogSource: 'Catálogo BALCÃO', catalogBrand: 'Limpol' },
  { barcode: '7890000001014', name: 'Arroz Tipo 1 5 kg', unit: 'UN', priceCents: 3490, stockMilli: 17000, minStockMilli: 7000, averageCostCents: 2490, catalogSource: 'Demonstração', catalogBrand: 'Casa Boa' },
  { barcode: '7890000001021', name: 'Feijão Carioca 1 kg', unit: 'UN', priceCents: 899, stockMilli: 23000, minStockMilli: 9000, averageCostCents: 579, catalogSource: 'Demonstração', catalogBrand: 'Casa Boa' },
  { barcode: '7890000001038', name: 'Açúcar Refinado 1 kg', unit: 'UN', priceCents: 599, stockMilli: 29000, minStockMilli: 10000, averageCostCents: 389, catalogSource: 'Demonstração', catalogBrand: 'Doce Lar' },
  { barcode: '7890000001045', name: 'Café Torrado 500 g', unit: 'UN', priceCents: 2290, stockMilli: 14000, minStockMilli: 6000, averageCostCents: 1620, catalogSource: 'Demonstração', catalogBrand: 'Serra Alta' },
  { barcode: '7890000001052', name: 'Leite Integral 1 L', unit: 'UN', priceCents: 649, stockMilli: 31000, minStockMilli: 12000, averageCostCents: 438, catalogSource: 'Demonstração', catalogBrand: 'Fazenda' },
  { barcode: '7890000001069', name: 'Refrigerante Cola 2 L', unit: 'UN', priceCents: 1199, stockMilli: 24000, minStockMilli: 10000, averageCostCents: 720, catalogSource: 'Demonstração', catalogBrand: 'Cola Sul' },
  { barcode: '7890000001076', name: 'Água Mineral 500 ml', unit: 'UN', priceCents: 350, stockMilli: 42000, minStockMilli: 15000, averageCostCents: 170, catalogSource: 'Demonstração', catalogBrand: 'Fonte Clara' },
  { barcode: '7890000001083', name: 'Biscoito Chocolate 90 g', unit: 'UN', priceCents: 499, stockMilli: 27000, minStockMilli: 10000, averageCostCents: 285, catalogSource: 'Demonstração', catalogBrand: 'Croc' },
  { barcode: '7890000001090', name: 'Salgadinho Queijo 90 g', unit: 'UN', priceCents: 799, stockMilli: 19000, minStockMilli: 8000, averageCostCents: 470, catalogSource: 'Demonstração', catalogBrand: 'Snack' },
  { barcode: '7890000001106', name: 'Chocolate ao Leite 90 g', unit: 'UN', priceCents: 849, stockMilli: 21000, minStockMilli: 8000, averageCostCents: 495, catalogSource: 'Demonstração', catalogBrand: 'Cacau Bom' },
  { barcode: '7890000001113', name: 'Papel Higiênico 12 rolos', unit: 'UN', priceCents: 2490, stockMilli: 12000, minStockMilli: 5000, averageCostCents: 1740, catalogSource: 'Demonstração', catalogBrand: 'Conforto' },
  { barcode: '7890000001120', name: 'Sabão Líquido 3 L', unit: 'UN', priceCents: 2990, stockMilli: 9000, minStockMilli: 5000, averageCostCents: 2010, catalogSource: 'Demonstração', catalogBrand: 'Limpa Mais' },
  { barcode: '7890000001137', name: 'Óleo de Soja 900 ml', unit: 'UN', priceCents: 899, stockMilli: 18000, minStockMilli: 8000, averageCostCents: 619, catalogSource: 'Demonstração', catalogBrand: 'Dourado' },
  { barcode: '7890000001144', name: 'Macarrão Espaguete 500 g', unit: 'UN', priceCents: 549, stockMilli: 26000, minStockMilli: 10000, averageCostCents: 329, catalogSource: 'Demonstração', catalogBrand: 'Mesa Boa' },
]

function isoDaysAgo(days: number, hour = 15, minute = 0) {
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

function saleFor(index: number, products: DemoProduct[]): Sale {
  const first = products[index % products.length]
  const second = products[(index * 3 + 5) % products.length]
  const firstQty = index % 5 === 0 ? 2000 : 1000
  const secondQty = index % 4 === 0 ? 2000 : 1000
  const items = [
    {
      productId: first.id,
      quantityMilli: firstQty,
      unitPriceCents: first.priceCents,
      lineTotalCents: Math.round(first.priceCents * firstQty / 1000),
      unitCostCents: first.averageCostCents,
      lineCostCents: Math.round(first.averageCostCents * firstQty / 1000),
    },
    {
      productId: second.id,
      quantityMilli: secondQty,
      unitPriceCents: second.priceCents,
      lineTotalCents: Math.round(second.priceCents * secondQty / 1000),
      unitCostCents: second.averageCostCents,
      lineCostCents: Math.round(second.averageCostCents * secondQty / 1000),
    },
  ]
  const totalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0)
  const cogsCents = items.reduce((sum, item) => sum + item.lineCostCents, 0)
  const paymentMethods = ['pix', 'card', 'cash'] as const
  return {
    id: `demo-sale-${String(index + 1).padStart(3, '0')}`,
    createdAt: isoDaysAgo(index % 42, 9 + (index % 10), (index * 7) % 60),
    totalCents,
    cogsCents,
    grossProfitCents: totalCents - cogsCents,
    items,
    payment: { method: paymentMethods[index % paymentMethods.length], confirmedAt: isoDaysAgo(index % 42, 9 + (index % 10), (index * 7) % 60) },
  }
}

export function createDemoStoreData(): DemoStoreData {
  const products = PRODUCT_SEED.map((product, index) => ({ ...product, id: `demo-product-${String(index + 1).padStart(2, '0')}` }))
  const sales = Array.from({ length: 36 }, (_, index) => saleFor(index, products))
  const soldByProduct = new Map<string, number>()

  for (const sale of sales) {
    for (const item of sale.items) soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + item.quantityMilli)
  }

  const movements: DemoMovement[] = products.map((product, index) => ({
    id: `demo-initial-${index + 1}`,
    productId: product.id,
    type: 'initial',
    quantityMilli: product.stockMilli + (soldByProduct.get(product.id) ?? 0),
    createdAt: isoDaysAgo(55, 8, index),
    note: 'Estoque inicial da conta de demonstração',
  }))

  for (const sale of sales) {
    sale.items.forEach((item, itemIndex) => movements.push({
      id: `demo-movement-${sale.id}-${itemIndex + 1}`,
      productId: item.productId,
      type: 'sale',
      quantityMilli: -item.quantityMilli,
      createdAt: sale.createdAt,
      note: `Venda ${sale.id.replace('demo-sale-', '#')}`,
    }))
  }

  const purchaseProducts = products.slice(0, 8)
  purchaseProducts.forEach((product, index) => movements.push({
    id: `demo-purchase-${index + 1}`,
    productId: product.id,
    type: 'purchase',
    quantityMilli: (8 + index) * 1000,
    createdAt: isoDaysAgo(12 + index, 10, 20),
    note: `NF-e DEMO-${1200 + index} · Distribuidora Modelo`,
    supplierName: 'Distribuidora Modelo Ltda.',
    invoiceNumber: `DEMO-${1200 + index}`,
  }))

  return {
    products: products.map((product) => ({ ...product })),
    sales: sales.map((sale) => ({ ...sale, items: sale.items.map((item) => ({ ...item })), payment: sale.payment ? { ...sale.payment } : undefined })),
    movements: movements.map((movement) => ({ ...movement })),
    scaleRule: { ...SCALE_RULE },
  }
}

function bankTransactions(): FinanceTransactionInput[] {
  const rows: Array<[number, number, string, string, string]> = [
    [1, 148500, 'REPASSE MERCADO PAGO', 'Mercado Pago', 'Recebimentos de vendas'],
    [2, -86340, 'COMPRA DISTRIBUIDORA MODELO', 'Distribuidora Modelo Ltda.', 'Fornecedores'],
    [3, 97200, 'PIX RECEBIDOS BALCAO', 'Clientes diversos', 'Recebimentos de vendas'],
    [5, -12890, 'CONTA DE ENERGIA', 'Energia Paulista', 'Utilidades'],
    [7, 186400, 'REPASSE GETNET', 'Getnet', 'Recebimentos de vendas'],
    [8, -245000, 'ALUGUEL LOJA', 'Imobiliária Centro', 'Aluguel'],
    [10, -62450, 'COMPRA ATACADISTA', 'Atacadista Central', 'Fornecedores'],
    [12, 119800, 'PIX RECEBIDOS BALCAO', 'Clientes diversos', 'Recebimentos de vendas'],
    [15, 131600, 'REPASSE CIELO', 'Cielo', 'Recebimentos de vendas'],
    [18, -79500, 'COMPRA BEBIDAS', 'Distribuidora Bebidas Sul', 'Fornecedores'],
    [21, 105300, 'PIX RECEBIDOS BALCAO', 'Clientes diversos', 'Recebimentos de vendas'],
    [25, -9800, 'INTERNET EMPRESARIAL', 'Operadora Demo', 'Utilidades'],
    [28, 142100, 'REPASSE REDE PAGAMENTOS', 'Rede', 'Recebimentos de vendas'],
    [34, -54100, 'COMPRA MERCEARIA', 'Atacado Modelo', 'Fornecedores'],
    [38, 112900, 'PIX RECEBIDOS BALCAO', 'Clientes diversos', 'Recebimentos de vendas'],
    [46, 125400, 'REPASSE MERCADO PAGO', 'Mercado Pago', 'Recebimentos de vendas'],
    [52, -58700, 'COMPRA HIGIENE', 'Distribuidora Modelo Ltda.', 'Fornecedores'],
  ]

  return rows.map(([days, amountCents, description, counterpartyName, category], index) => ({
    id: `demo-bank-${index + 1}`,
    accountId: 'demo-account-1',
    postedAt: isoDaysAgo(days, 12, index * 3),
    amountCents,
    description,
    counterpartyName,
    category,
    categoryConfidence: 0.99,
    transactionType: amountCents >= 0 ? 'Crédito' : 'Débito',
    isInternalTransfer: false,
    source: 'mock',
  }))
}

export function createDemoFinanceDashboard(days: 7 | 30 | 90, storeData: DemoStoreData) {
  return buildFinanceDashboard({
    days,
    accounts: [{
      id: 'demo-account-1',
      institutionName: 'Banco Demo',
      accountName: 'Conta Movimento · Demonstração',
      accountType: 'Conta corrente',
      maskedNumber: '4821',
      balanceCents: 1843000,
      currency: 'BRL',
      status: 'active',
      source: 'mock',
      lastSyncedAt: new Date().toISOString(),
    }],
    transactions: bankTransactions(),
    dailyMetrics: [],
    inventoryState: {
      products: storeData.products.map((product) => ({ id: product.id, stockMilli: product.stockMilli, averageCostCents: product.averageCostCents })),
      sales: storeData.sales.map((sale) => ({ ...sale, items: sale.items.map((item) => ({ ...item })) })),
    },
  })
}

export function createDemoPixCharge(amountCents: number) {
  const safeAmount = Number.isFinite(amountCents) ? Math.max(0, Math.round(amountCents)) : 0
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" fill="white"/><rect x="24" y="24" width="272" height="272" rx="24" fill="#f1f5f9" stroke="#0f172a" stroke-width="8"/><text x="160" y="146" text-anchor="middle" font-family="Arial,sans-serif" font-size="40" font-weight="700" fill="#0f172a">PIX DEMO</text><text x="160" y="190" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#475569">sem transação real</text></svg>`
  return {
    amountCents: safeAmount,
    payload: `BALCAO-DEMO-PIX-${safeAmount}`,
    qrDataUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
  }
}
