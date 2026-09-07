import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return fs.readFileSync(path, 'utf8')
}

test('temporary backend login verifies the one-time email token and redirects to manage', () => {
  const route = source('app/api/balcao/test-login/route.ts')

  assert.match(route, /verifyOtp/)
  assert.match(route, /token_hash/)
  assert.match(route, /type:\s*['"]email['"]/)
  assert.match(route, /renanguadalupe05@gmail\.com/)
  assert.match(route, /\/manage/)
  assert.doesNotMatch(route, /google/)
})
