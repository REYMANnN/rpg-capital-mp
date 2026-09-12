import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deriveInventoryStateEvents } from '../../lib/platform/events/inventoryStateEvents.ts'
import { WEBHOOK_FAILURE_PAUSE_THRESHOLD, WEBHOOK_RETRY_SECONDS, nextWebhookRetry } from '../../lib/platform/webhooks/delivery.ts'

const root = process.cwd()

test('inventory state changes emit sale, product, price and movement events without duplicates', () => {
  const before = {
    products: [{ id: 'p1', name: 'Coca', priceCents: 1000, stockMilli: 10000, minStockMilli: 2000 }],
    sales: [],
    movements: [],
  }
  const after = {
    products: [
      { id: 'p1', name: 'Coca', priceCents: 1049, stockMilli: 1000, minStockMilli: 2000 },
      { id: 'p2', name: 'Água', priceCents: 300, stockMilli: 5000, minStockMilli: 1000 },
    ],
    sales: [{ id: 's1', createdAt: '2026-09-12T12:00:00Z', totalCents: 1049, items: [] }],
    movements: [{ id: 'm1', productId: 'p1', type: 'sale', quantityMilli: -1000, createdAt: '2026-09-12T12:00:00Z' }],
  }
  const events = deriveInventoryStateEvents(before, after)
  const types = events.map((event) => event.type)
  assert.equal(types.filter((type) => type === 'sale.created').length, 1)
  assert.equal(types.filter((type) => type === 'product.created').length, 1)
  assert.equal(types.filter((type) => type === 'product.updated').length, 1)
  assert.equal(types.filter((type) => type === 'pricing.price.changed').length, 1)
  assert.equal(types.filter((type) => type === 'inventory.movement.created').length, 1)
  assert.equal(types.filter((type) => type === 'inventory.low_stock').length, 1)
})

test('webhook retry policy matches the product spec and pauses after sustained failures', () => {
  assert.deepEqual([...WEBHOOK_RETRY_SECONDS], [30, 120, 600, 3600, 21600])
  assert.equal(WEBHOOK_FAILURE_PAUSE_THRESHOLD, 20)
  assert.equal(nextWebhookRetry(1, 0), '1970-01-01T00:00:30.000Z')
  assert.equal(nextWebhookRetry(5, 0), '1970-01-01T06:00:00.000Z')
})

test('dispatcher processes outbox asynchronously with signed headers and delivery persistence', () => {
  const dispatcher = readFileSync(join(root, 'supabase/functions/balcao-webhook-dispatcher/index.ts'), 'utf8')
  assert.match(dispatcher, /balcao_event_outbox/)
  assert.match(dispatcher, /balcao_webhook_deliveries/)
  assert.match(dispatcher, /X-RPG-Event-Id/)
  assert.match(dispatcher, /X-RPG-Timestamp/)
  assert.match(dispatcher, /X-RPG-Signature/)
  assert.match(dispatcher, /consecutive_failures/)
  assert.match(dispatcher, /BALCAO_WEBHOOK_DISPATCH_SECRET/)
})
