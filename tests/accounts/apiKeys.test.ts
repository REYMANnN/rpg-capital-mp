import test from 'node:test'
import assert from 'node:assert/strict'
import { API_SCOPES, generateApiKey, hashApiSecret, isSensitiveScope, parseApiKey } from '../../lib/platform/auth/apiKeys.ts'

test('API keys are one-time secrets with a lookup prefix and deterministic hash', () => {
  const key = generateApiKey()
  assert.match(key.token, /^rpg_live_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{30,}$/)
  const parsed = parseApiKey(key.token)
  assert.equal(parsed?.prefix, key.prefix)
  assert.equal(parsed?.secret, key.secret)
  assert.equal(hashApiSecret(key.secret), key.secretHash)
  assert.equal(hashApiSecret(key.secret), hashApiSecret(key.secret))
})

test('public scopes are software/data only and flag sensitive writes', () => {
  for (const scope of ['products:read','inventory:read','sales:read','finance:read','pricing:read','webhooks:manage']) assert.equal(API_SCOPES.includes(scope as any), true)
  assert.equal(isSensitiveScope('finance:read'), true)
  assert.equal(isSensitiveScope('sales:ingest'), true)
  assert.equal(isSensitiveScope('products:read'), false)
  assert.equal(API_SCOPES.some((scope) => /pix|payment|transfer|wallet|bank:write/i.test(scope)), false)
})
