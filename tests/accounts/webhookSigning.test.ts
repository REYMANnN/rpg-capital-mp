import test from 'node:test'
import assert from 'node:assert/strict'
import { WEBHOOK_EVENT_TYPES } from '../../lib/platform/events/eventTypes.ts'
import { signWebhookBody, verifyWebhookSignature } from '../../lib/platform/webhooks/signing.ts'

test('webhook HMAC signs timestamp plus exact body and rejects tampering', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'sale.created' })
  const signature = signWebhookBody('secret-123', '1789230000', body)
  assert.match(signature, /^v1=[0-9a-f]{64}$/)
  assert.equal(verifyWebhookSignature('secret-123', '1789230000', body, signature), true)
  assert.equal(verifyWebhookSignature('secret-123', '1789230000', body + 'x', signature), false)
})

test('webhook event catalogue contains the v1 business events and no money movement event', () => {
  for (const event of ['sale.created','product.updated','inventory.low_stock','pricing.price.changed','finance.transaction.created','finance.card_settlement.detected','integration.sync.failed','webhook.test']) assert.equal(WEBHOOK_EVENT_TYPES.includes(event as any), true)
  assert.equal(WEBHOOK_EVENT_TYPES.some((event) => /pix|payment|transfer/i.test(event)), false)
})
