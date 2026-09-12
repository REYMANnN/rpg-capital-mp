import type { WebhookEventType } from './eventTypes'

type State = { products: any[]; sales: any[]; movements: any[] }
export type DerivedPlatformEvent = {
  type: WebhookEventType
  aggregateType: string
  aggregateId: string
  data: Record<string, unknown>
}

function byId(rows: any[]) {
  return new Map(rows.filter((row) => row?.id != null).map((row) => [String(row.id), row]))
}

function productDefinition(row: any) {
  if (!row) return null
  const { stockMilli: _stock, ...definition } = row
  return definition
}

export function deriveInventoryStateEvents(before: State, after: State): DerivedPlatformEvent[] {
  const events: DerivedPlatformEvent[] = []
  const beforeProducts = byId(before.products)
  const afterProducts = byId(after.products)
  const beforeSales = byId(before.sales)
  const beforeMovements = byId(before.movements)

  for (const [id, product] of afterProducts) {
    const previous = beforeProducts.get(id)
    if (!previous) {
      events.push({
        type: 'product.created',
        aggregateType: 'product',
        aggregateId: id,
        data: { productId: id, barcode: product.barcode ?? null, name: product.name ?? null },
      })
    } else {
      if (JSON.stringify(productDefinition(previous)) !== JSON.stringify(productDefinition(product))) {
        events.push({
          type: 'product.updated',
          aggregateType: 'product',
          aggregateId: id,
          data: { productId: id },
        })
      }
      const oldPrice = Number(previous.priceCents ?? 0)
      const newPrice = Number(product.priceCents ?? 0)
      if (oldPrice !== newPrice) {
        events.push({
          type: 'pricing.price.changed',
          aggregateType: 'product',
          aggregateId: id,
          data: { productId: id, oldPriceCents: oldPrice, newPriceCents: newPrice, source: 'manual' },
        })
      }
    }

    const currentStock = Number(product.stockMilli ?? 0)
    const minimumStock = Number(product.minStockMilli ?? 0)
    const previousStock = previous ? Number(previous.stockMilli ?? 0) : Number.POSITIVE_INFINITY
    if (minimumStock > 0 && currentStock <= minimumStock && previousStock > minimumStock) {
      events.push({
        type: 'inventory.low_stock',
        aggregateType: 'product',
        aggregateId: id,
        data: { productId: id, stockMilli: currentStock, minStockMilli: minimumStock },
      })
    }
  }

  for (const sale of after.sales) {
    const id = sale?.id == null ? '' : String(sale.id)
    if (!id || beforeSales.has(id)) continue
    events.push({
      type: 'sale.created',
      aggregateType: 'sale',
      aggregateId: id,
      data: {
        saleId: id,
        createdAt: sale.createdAt ?? null,
        totalCents: Number(sale.totalCents ?? 0),
        paymentMethod: sale.payment?.method ?? null,
      },
    })
  }

  for (const movement of after.movements) {
    const id = movement?.id == null ? '' : String(movement.id)
    if (!id || beforeMovements.has(id)) continue
    events.push({
      type: 'inventory.movement.created',
      aggregateType: 'inventory_movement',
      aggregateId: id,
      data: {
        movementId: id,
        productId: movement.productId == null ? null : String(movement.productId),
        type: movement.type ?? null,
        quantityMilli: Number(movement.quantityMilli ?? 0),
        createdAt: movement.createdAt ?? null,
      },
    })
  }

  return events
}
