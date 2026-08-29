import test from 'node:test'
import assert from 'node:assert/strict'
import { decideOperationalAccess } from '../../lib/accounts/contextPolicy'

test('legacy installation cookie alone never authorizes a store', () => {
  const result = decideOperationalAccess({ hasInstallationCookie: true, googleMember: false, terminalValid: false, staffSessionValid: false })
  assert.deepEqual(result, { authorized: false, mode: null })
})

test('Google business membership authorizes management operation', () => {
  const result = decideOperationalAccess({ hasInstallationCookie: true, googleMember: true, terminalValid: false, staffSessionValid: false })
  assert.deepEqual(result, { authorized: true, mode: 'google' })
})

test('authorized terminal requires an active staff session for operational writes', () => {
  assert.deepEqual(decideOperationalAccess({ hasInstallationCookie: true, googleMember: false, terminalValid: true, staffSessionValid: false }), { authorized: false, mode: null })
  assert.deepEqual(decideOperationalAccess({ hasInstallationCookie: true, googleMember: false, terminalValid: true, staffSessionValid: true }), { authorized: true, mode: 'staff' })
})

test('invalid terminal never inherits access from staff cookie', () => {
  assert.deepEqual(decideOperationalAccess({ hasInstallationCookie: true, googleMember: false, terminalValid: false, staffSessionValid: true }), { authorized: false, mode: null })
})
