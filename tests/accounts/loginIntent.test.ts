import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return fs.readFileSync(path, 'utf8')
}

test('Google auth preserves whether the user chose login or signup', () => {
  const loginPage = source('app/login/page.tsx')
  const button = source('components/accounts/GoogleAuthButton.tsx')

  assert.match(loginPage, /GoogleAuthButton[^\n]*intent=/)
  assert.match(button, /intent:\s*'login'\s*\|\s*'signup'/)
  assert.match(button, /\/auth\/google\/complete\?intent=/)
})

test('login refuses a Google identity without an existing BALCAO account', () => {
  const complete = source('app/auth/google/complete/route.ts')

  assert.match(complete, /intent\s*===\s*'login'/)
  assert.match(complete, /state\.onboarded/)
  assert.match(complete, /state\.hasBusiness/)
  assert.match(complete, /auth\.signOut\(\)/)
  assert.match(complete, /conta-nao-encontrada/)
})

test('signup can continue to onboarding while an existing account goes to management', () => {
  const complete = source('app/auth/google/complete/route.ts')

  assert.match(complete, /intent\s*===\s*'signup'/)
  assert.match(complete, /\/onboarding/)
  assert.match(complete, /destinationAfterLogin/)
})
