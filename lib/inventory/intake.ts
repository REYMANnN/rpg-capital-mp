export function calculatePurchaseUpdate(
  currentStockMilli: number,
  currentAverageCostCents: number,
  quantityMilli: number,
  unitCostCents: number,
) {
  if (!Number.isInteger(quantityMilli) || quantityMilli <= 0) {
    throw new Error('Quantidade de compra inválida.')
  }
  if (!Number.isInteger(unitCostCents) || unitCostCents < 0) {
    throw new Error('Custo de compra inválido.')
  }

  const stockMilli = Math.max(0, currentStockMilli) + quantityMilli
  if (currentStockMilli <= 0) {
    return { stockMilli, averageCostCents: unitCostCents }
  }

  const averageCostCents = Math.round(
    (currentStockMilli * Math.max(0, currentAverageCostCents) + quantityMilli * unitCostCents) / stockMilli,
  )

  return { stockMilli, averageCostCents }
}
