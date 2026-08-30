import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const buttonSource = readFileSync(new URL('../../components/accounts/GoogleAuthButton.tsx', import.meta.url), 'utf8')

test('Google login stays inside BALCAO instead of depending on Supabase redirect URLs', () => {
  assert.match(buttonSource, /signInWithIdToken/)
  assert.doesNotMatch(buttonSource, /signInWithOAuth/)
  assert.match(buttonSource, /accounts\.google\.com\/gsi\/client/)
  assert.equal(existsSync(new URL('../../app/auth/google/complete/route.ts', import.meta.url)), true)
})
