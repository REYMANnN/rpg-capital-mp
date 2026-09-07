import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('temporary magic-link authentication artifacts are not shipped', () => {
  assert.equal(fs.existsSync('app/api/balcao/test-magic-link/route.ts'), false)
  assert.equal(fs.existsSync('app/auth/test-complete/page.tsx'), false)
  assert.equal(fs.existsSync('components/accounts/TestGoogleLoginButton.tsx'), false)
})
