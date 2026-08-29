import test from 'node:test'
import assert from 'node:assert/strict'
import { hashPin, verifyPin } from '../../lib/accounts/pin'
import { hashSecret, isInviteUsable, makeSecret, packCredential, unpackCredential } from '../../lib/accounts/terminal'

test('PIN is hashed and verifies only the correct 4 digits', async () => {
  const hash = await hashPin('4821')
  assert.notEqual(hash, '4821')
  assert.equal(await verifyPin('4821', hash), true)
  assert.equal(await verifyPin('4822', hash), false)
})

test('PIN helpers reject malformed PINs', async () => {
  await assert.rejects(() => hashPin('123'), /4 dígitos/)
  await assert.rejects(() => hashPin('abcd'), /4 dígitos/)
})

test('terminal secrets are random and hashed before persistence', () => {
  const one = makeSecret()
  const two = makeSecret()
  assert.notEqual(one, two)
  assert.notEqual(hashSecret(one), one)
  assert.equal(hashSecret(one), hashSecret(one))
})

test('credential packing is reversible without exposing structure ambiguity', () => {
  const value = packCredential('8c1eb842-e83c-4a96-b469-3b03461a8f51', 'secret-value')
  assert.deepEqual(unpackCredential(value), { id: '8c1eb842-e83c-4a96-b469-3b03461a8f51', secret: 'secret-value' })
  assert.equal(unpackCredential('broken'), null)
})

test('invite is usable only before expiry and before use/revocation', () => {
  const now = new Date('2026-08-29T20:00:00Z')
  assert.equal(isInviteUsable({ expiresAt: '2026-08-29T20:15:00Z', usedAt: null, revokedAt: null }, now), true)
  assert.equal(isInviteUsable({ expiresAt: '2026-08-29T19:59:59Z', usedAt: null, revokedAt: null }, now), false)
  assert.equal(isInviteUsable({ expiresAt: '2026-08-29T20:15:00Z', usedAt: '2026-08-29T19:55:00Z', revokedAt: null }, now), false)
  assert.equal(isInviteUsable({ expiresAt: '2026-08-29T20:15:00Z', usedAt: null, revokedAt: '2026-08-29T19:55:00Z' }, now), false)
})
