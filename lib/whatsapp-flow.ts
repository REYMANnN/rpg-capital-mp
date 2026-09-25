type SaleSummary = {
  kind: 'sale'
  items: Array<{ name: string; quantity: string }>
  totalCents: number
  paymentMethod: string
}

type ProductSummary = {
  kind: 'product'
  name: string
  priceCents: number
  costCents: number
  stock: string
}

type NoticeSummary = {
  kind: 'notice'
  code: 'product_not_found'
}

type StockSummary = {
  kind: 'stock'
  mode: 'nfe' | 'ean'
  itemCount?: number
  totalCostCents?: number
  invoiceNumber?: string
  productName?: string
  quantity?: string
}

// Fechamento do caixa aberto pelo link (várias vendas na mesma sessão).
type CaixaSummary = {
  kind: 'caixa'
  salesCount: number
  totalCents: number
}

// Várias entradas lidas em sequência no /r/entrada.
type EntryBatchSummary = {
  kind: 'entrada'
  items: Array<{ name: string; quantity: string }>
  totalCostCents: number
}

export type WhatsAppFlowSummary = SaleSummary | ProductSummary | StockSummary | NoticeSummary | CaixaSummary | EntryBatchSummary

const money = (cents: number) => (Number(cents || 0) / 100).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function paymentLabel(value: string) {
  if (value === 'pix') return 'Pix'
  if (value === 'card') return 'Cartão'
  if (value === 'cash') return 'Dinheiro'
  return value || 'Não informada'
}

export function formatWhatsAppFlowSummary(summary: WhatsAppFlowSummary) {
  if (summary.kind === 'sale') {
    const items = summary.items.slice(0, 20).map((item) => `• ${item.quantity} × ${item.name}`).join('\n')
    return `Venda concluída.\n${items}\nTotal: ${money(summary.totalCents)}\nPagamento: ${paymentLabel(summary.paymentMethod)}\n— Rafa`
  }

  if (summary.kind === 'caixa') {
    if (!summary.salesCount) return 'Caixa fechado. Nenhuma venda nesse período.\n— Rafa'
    return `Caixa fechado.\nVendas: ${summary.salesCount}\nTotal: ${money(summary.totalCents)}\n— Rafa`
  }

  if (summary.kind === 'entrada') {
    if (!summary.items.length) return 'Entrada encerrada sem itens.\n— Rafa'
    const items = summary.items.slice(0, 20).map((item) => `• ${item.quantity} × ${item.name}`).join('\n')
    return `Estoque atualizado.\n${items}\nCusto total: ${money(summary.totalCostCents)}\n— Rafa`
  }

  if (summary.kind === 'notice') {
    return 'Esse código ainda não está cadastrado. Abri o cadastro no Balcão para você completar.'
  }

  if (summary.kind === 'product') {
    const marginCents = summary.priceCents - summary.costCents
    const marginPercent = summary.priceCents > 0 ? (marginCents / summary.priceCents) * 100 : 0
    return `${summary.name}\nVenda: ${money(summary.priceCents)}\nCusto: ${money(summary.costCents)}\nMargem: ${money(marginCents)} (${marginPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)\nEstoque: ${summary.stock}\n— Rafa`
  }

  if (summary.mode === 'nfe') {
    return `Entrada concluída pela NF-e${summary.invoiceNumber ? ` ${summary.invoiceNumber}` : ''}.\nItens: ${summary.itemCount ?? 0}\nCusto total: ${money(summary.totalCostCents ?? 0)}\n— Rafa`
  }

  return `Entrada concluída.\nProduto: ${summary.productName || 'Produto'}\nQuantidade: ${summary.quantity || '—'}\n— Rafa`
}
