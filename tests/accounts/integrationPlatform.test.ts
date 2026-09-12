import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { normalizeAuthority } from '../../lib/platform/integrations/authority.ts'
import { hashIdempotencyKey, hashRequestBody } from '../../lib/platform/idempotency.ts'

test('integration authority has explicit source of truth per domain', () => {
  assert.deepEqual(normalizeAuthority({ products: 'external', inventory: 'external', sales: 'external', pricing: 'balcao' }), {
    products: 'external', inventory: 'external', sales: 'external', pricing: 'balcao', finance: 'balcao',
  })
})

test('idempotency hashes keys and exact request bodies without storing plaintext', () => {
  assert.equal(hashIdempotencyKey('sale-123'), createHash('sha256').update('sale-123').digest('hex'))
  assert.equal(hashRequestBody('{"a":1}'), hashRequestBody('{"a":1}'))
  assert.notEqual(hashRequestBody('{"a":1}'), hashRequestBody('{"a":2}'))
})
