import type { Permission } from './access'

export type InventoryStateSnapshot = {
  products: unknown[]
  sales: unknown[]
  movements: unknown[]
  scaleRule?: unknown
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function requiredPermissionsForStateChange(
  before: InventoryStateSnapshot,
  after: InventoryStateSnapshot,
): Permission[] {
  const required = new Set<Permission>()
  const salesChanged = !same(before.sales, after.sales)
  const productsChanged = !same(before.products, after.products)
  const movementsChanged = !same(before.movements, after.movements)
  const settingsChanged = !same(before.scaleRule ?? null, after.scaleRule ?? null)

  if (settingsChanged) required.add('settings.manage')
  if (salesChanged) required.add('checkout.sell')
  if ((productsChanged || movementsChanged) && !salesChanged) required.add('inventory.write')

  return [...required]
}
