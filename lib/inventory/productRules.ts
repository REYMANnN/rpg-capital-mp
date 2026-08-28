export function validateNewProductCommercialData(priceCents: number, purchaseCostCents: number) {
  if (!Number.isInteger(priceCents) || priceCents <= 0) return 'Informe o preço de venda.'
  if (!Number.isInteger(purchaseCostCents) || purchaseCostCents <= 0) return 'Informe o custo de compra.'
  return ''
}

export function validateSalePrice(priceCents: number) {
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    return 'Defina o preço de venda antes de vender este produto.'
  }
  return ''
}
