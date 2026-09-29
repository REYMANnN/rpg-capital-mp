// Regras fixas de segurança das escritas da Rafa (sem banco, testáveis com node --test).
// Rodam DEPOIS da IA decidir: a IA escolhe o que fazer, o servidor decide se pode.

import type { RafaChange, RafaStoreState } from '@/lib/inventory/rafa-store'

// Dígito verificador de EAN-8/12/13/14 (cópia local para o módulo continuar puro).
export function isValidGtin(value: string) {
  const digits = String(value || '').replace(/\D/g, '')
  if (![8, 12, 13, 14].includes(digits.length) || digits !== String(value || '').trim()) return false
  const nums = digits.split('').map(Number)
  const check = nums.pop()!
  const sum = nums.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

export const RAFA_LIMITS = {
  maxChanges: 200,
  maxPriceCents: 10_000_000, // R$ 100.000
  maxQuantityMilli: 100_000_000, // 100 mil unidades
  bulkThreshold: 20,
}

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// null = pode gravar; string = motivo claro para o lojista.
export function validateRafaChangesStrict(state: RafaStoreState, changes: RafaChange[]): string | null {
  if (!Array.isArray(changes) || !changes.length) return 'Nenhuma alteração informada.'
  if (changes.length > RAFA_LIMITS.maxChanges) return `São ${changes.length} alterações de uma vez; o máximo é ${RAFA_LIMITS.maxChanges}.`
  const byId = new Map(state.products.map((product) => [product.id, product]))
  const intInRange = (value: number, max: number) => Number.isInteger(value) && value > 0 && value <= max
  for (const change of changes) {
    if (change.kind === 'cadastrar') {
      if (!isValidGtin(change.barcode)) return `Código de barras inválido para "${change.name}".`
      if (!change.name || change.name.trim().length < 2) return 'Falta o nome do produto novo.'
      if (!intInRange(change.priceCents, RAFA_LIMITS.maxPriceCents)) return `Preço inválido para "${change.name}".`
      if (!intInRange(change.costCents, RAFA_LIMITS.maxPriceCents)) return `Custo inválido para "${change.name}".`
      if (!Number.isInteger(change.stockMilli) || change.stockMilli < 0 || change.stockMilli > RAFA_LIMITS.maxQuantityMilli) return `Estoque inicial inválido para "${change.name}".`
      const clash = state.products.find((product) => product.barcode === change.barcode && !product.deletedAt && product.id !== change.productId)
      if (clash) return `Já existe ${clash.name} com o código ${change.barcode}.`
      continue
    }
    // Produto tem que ser desta loja (o estado carregado é só da loja da sessão) e estar ativo.
    const product = byId.get(change.productId)
    if (!product || product.deletedAt) return 'Produto não encontrado nesta loja.'
    if (change.kind === 'preco' && !intInRange(change.newPriceCents, RAFA_LIMITS.maxPriceCents)) return `Preço inválido para ${product.name}.`
    if (change.kind === 'estoque' && (!Number.isInteger(change.newStockMilli) || change.newStockMilli < 0 || change.newStockMilli > RAFA_LIMITS.maxQuantityMilli)) return `Estoque inválido para ${product.name}.`
    if ((change.kind === 'entrada' || change.kind === 'venda') && !intInRange(change.quantityMilli, RAFA_LIMITS.maxQuantityMilli)) return `Quantidade inválida para ${product.name}.`
    if (change.kind === 'entrada' && !intInRange(change.unitCostCents, RAFA_LIMITS.maxPriceCents)) return `Custo inválido para ${product.name}.`
  }
  return null
}

// Casos em que a Rafa PERGUNTA antes (o resto ela faz e oferece "desfaz").
export function rafaOperationRisks(state: RafaStoreState, changes: RafaChange[]): string[] {
  const byId = new Map(state.products.map((product) => [product.id, product]))
  const risks: string[] = []
  if (changes.length > RAFA_LIMITS.bulkThreshold) risks.push(`são ${changes.length} alterações de uma vez`)
  for (const change of changes) {
    if (change.kind === 'remover') {
      const product = byId.get(change.productId)
      risks.push(`remover ${product?.name || 'produto'}`)
    }
    if (change.kind === 'preco') {
      const product = byId.get(change.productId)
      const cost = Math.round(product?.averageCostCents || 0)
      if (product && cost > 0 && change.newPriceCents < cost) risks.push(`${product.name} a ${money(change.newPriceCents)} fica abaixo do custo (${money(cost)})`)
    }
    if (change.kind === 'cadastrar' && change.priceCents < change.costCents) {
      risks.push(`${change.name} a ${money(change.priceCents)} fica abaixo do custo (${money(change.costCents)})`)
    }
  }
  return risks
}
