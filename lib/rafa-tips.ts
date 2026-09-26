import type { RafaStoreState } from '@/lib/inventory/rafa-store'

// Rafa como gerente: tarefas curtas e conselhos a partir dos dados da loja.
// Preço, custo e quantidade nunca são sugeridos: a dica sempre pede o dado ao lojista ou à nota.

export const SOLD_WITHOUT_STOCK_NOTE = 'Venda sem estoque registrado'

const DAY = 24 * 3600_000

export type InventoryFacts = {
  products: number
  withoutCost: string[]
  soldWithoutStock: string[]
  runningOut: Array<{ name: string; days: number }>
  pendingPrices: number
  salesLast7: number
  purchasesLast7: number
}

export function inventoryFacts(state: RafaStoreState, pendingPrices: number, now = Date.now()): InventoryFacts {
  const active = state.products.filter((product) => !product.deletedAt)
  const byId = new Map(active.map((product) => [product.id, product]))
  const since7 = now - 7 * DAY
  const since14 = now - 14 * DAY
  const recent = state.movements.filter((movement) => Date.parse(movement.createdAt) >= since14)

  // Vendido nos últimos 14 dias, por produto (em unidades milli).
  const sold = new Map<string, number>()
  for (const movement of recent) {
    if (movement.type === 'sale') sold.set(movement.productId, (sold.get(movement.productId) || 0) + Math.abs(movement.quantityMilli))
  }

  const soldWithoutStock = [...new Set(recent
    .filter((movement) => movement.type === 'adjustment' && movement.note.startsWith(SOLD_WITHOUT_STOCK_NOTE) && Date.parse(movement.createdAt) >= since7)
    .map((movement) => byId.get(movement.productId)?.name)
    .filter((name): name is string => Boolean(name)))]

  const withoutCost = active
    .filter((product) => !(Number(product.averageCostCents) > 0) && sold.has(product.id))
    .map((product) => product.name)

  const runningOut = active
    .map((product) => {
      const perDay = (sold.get(product.id) || 0) / 14
      return { name: product.name, perDay, days: perDay > 0 ? product.stockMilli / perDay : Infinity }
    })
    .filter((entry) => entry.perDay > 0 && entry.days <= 3)
    .sort((a, b) => a.days - b.days)
    .slice(0, 3)
    .map((entry) => ({ name: entry.name, days: Math.max(0, Math.floor(entry.days)) }))

  return {
    products: active.length,
    withoutCost,
    soldWithoutStock,
    runningOut,
    pendingPrices,
    salesLast7: state.sales.filter((sale) => Date.parse(sale.createdAt) >= since7).length,
    purchasesLast7: state.movements.filter((movement) => movement.type === 'purchase' && Date.parse(movement.createdAt) >= since7).length,
  }
}

const list = (names: string[], max = 3) => names.slice(0, max).join(', ') + (names.length > max ? ` e mais ${names.length - max}` : '')

// A tarefa/conselho mais útil de hoje (ou nada, se a loja está em dia).
export function pickDailyTip(facts: InventoryFacts): { key: string; message: string } | null {
  if (facts.pendingPrices > 0) {
    return { key: 'pending_prices', message: `Tarefa rápida: faltam os preços de venda de ${facts.pendingPrices} produto(s) da nota. Me fala num áudio que eu cadastro.` }
  }
  if (!facts.products) {
    return { key: 'first_invoice', message: 'Pra começar seu estoque sem trabalho: manda a foto da última nota do atacado. Eu coloco os produtos, a quantidade e o custo.' }
  }
  if (facts.soldWithoutStock.length) {
    return { key: 'sold_without_stock', message: `Essa semana saiu ${list(facts.soldWithoutStock)} sem estoque registrado. Manda a foto da nota da última compra deles que eu acerto.` }
  }
  if (facts.runningOut.length) {
    const item = facts.runningOut[0]
    const when = item.days === 0 ? 'já está acabando' : `acaba em uns ${item.days} dia(s) no ritmo de vendas`
    return { key: 'running_out', message: `${item.name} ${when}. Vale colocar na próxima compra.` }
  }
  if (facts.withoutCost.length) {
    return { key: 'without_cost', message: `${facts.withoutCost.length} produto(s) vendem sem custo cadastrado (${list(facts.withoutCost)}). Manda as notas deles que eu calculo seu lucro de verdade.` }
  }
  if (facts.salesLast7 > 0 && facts.purchasesLast7 === 0) {
    return { key: 'no_invoice_week', message: 'Comprou mercadoria essa semana? Manda a foto da nota que eu atualizo seu estoque. Dica: guarda as notas perto do caixa e manda todas no fim do dia.' }
  }
  return null
}

// Bloco para o agente: a situação do estoque e como aconselhar.
export function inventoryAdviceBlock(state: RafaStoreState, pendingPrices: number) {
  const facts = inventoryFacts(state, pendingPrices)
  const lines = [
    'SITUAÇÃO DO ESTOQUE (para dar conselhos e tarefas):',
    `• ${facts.products} produtos cadastrados; ${facts.pendingPrices} da nota esperando preço`,
    `• vendidos sem custo cadastrado: ${facts.withoutCost.length ? list(facts.withoutCost, 5) : 'nenhum'}`,
    `• vendidos sem estoque registrado (7 dias): ${facts.soldWithoutStock.length ? list(facts.soldWithoutStock, 5) : 'nenhum'}`,
    `• acabando: ${facts.runningOut.length ? facts.runningOut.map((item) => `${item.name} (~${item.days} dia)`).join(', ') : 'nada'}`,
    `• notas lançadas nos últimos 7 dias: ${facts.purchasesLast7}`,
    'CONSELHOS: você é a gerente que ajuda o lojista a montar o estoque sem trabalho. O jeito principal é mandar a foto (ou PDF/XML) das notas de compra; o caixa cadastra o que ele vender e não estiver na loja. Quando ajudar, dê tarefas curtas e concretas com o ganho ("manda a nota do Atacadão pra eu colocar o custo de 15 produtos e você ver seu lucro"). Nunca sugira preço de venda, custo ou quantidade: peça ao lojista ou à nota. Nunca peça para contar a loja inteira; no máximo 3 produtos.',
  ]
  return lines.join('\n')
}
