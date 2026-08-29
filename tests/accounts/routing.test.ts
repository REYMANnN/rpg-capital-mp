import test from 'node:test'
import assert from 'node:assert/strict'
import { destinationAfterLogin, safeNextPath } from '../../lib/accounts/routing'

test('new authenticated users are sent to onboarding', () => {
  assert.equal(destinationAfterLogin({ onboarded: false, hasBusiness: false }), '/onboarding')
})

test('onboarded users with a business are sent to management', () => {
  assert.equal(destinationAfterLogin({ onboarded: true, hasBusiness: true }), '/manage')
})

test('safe next accepts only local absolute paths', () => {
  assert.equal(safeNextPath('/manage?store=1'), '/manage?store=1')
  assert.equal(safeNextPath('https://evil.example'), null)
  assert.equal(safeNextPath('//evil.example'), null)
  assert.equal(safeNextPath('manage'), null)
})
