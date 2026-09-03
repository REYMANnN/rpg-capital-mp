import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return fs.readFileSync(path, 'utf8')
}

test('temporary activation sends a Supabase magic link without Google OAuth', () => {
  const route = source('app/api/balcao/test-magic-link/route.ts')

  assert.match(route, /renanguadalupe05@gmail\.com/)
  assert.match(route, /signInWithOtp/)
  assert.match(route, /shouldCreateUser:\s*false/)
  assert.match(route, /\/auth\/test-complete/)
  assert.doesNotMatch(route, /google/)
})

test('temporary callback establishes the Supabase session and opens manage', () => {
  const callback = source('app/auth/test-complete/page.tsx')

  assert.match(callback, /access_token/)
  assert.match(callback, /refresh_token/)
  assert.match(callback, /setSession/)
  assert.match(callback, /\/manage/)
})
