export type LifecycleProduct = {
  stockMilli: number
  deletedAt?: string
}

export function softDeleteProduct<T extends LifecycleProduct>(product: T, deletedAt: string) {
  return {
    product: { ...product, stockMilli: 0, deletedAt },
    stockAdjustmentMilli: -product.stockMilli,
  }
}

export function reactivateProduct<T extends LifecycleProduct>(product: T): T {
  return { ...product, stockMilli: 0, deletedAt: undefined }
}

export function activeProducts<T extends { deletedAt?: string }>(products: T[]) {
  return products.filter((product) => !product.deletedAt)
}
