import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return fs.readFileSync(path, 'utf8')
}

test('root sends visitors to the stable public home', () => {
  const root = source('app/page.tsx')
  assert.match(root, /redirect\(['"]\/home['"]\)/)
})

test('public home offers existing-account and signup paths', () => {
  const home = source('app/home/page.tsx')

  assert.match(home, /Minha Conta/)
  assert.match(home, /Criar Conta/)
  assert.match(home, /\/login\?intent=login/)
  assert.match(home, /\/login\?intent=signup/)
})

test('public home exposes the temporary test-account OAuth path', () => {
  const home = source('app/home/page.tsx')
  const button = source('components/accounts/TestGoogleLoginButton.tsx')

  assert.match(home, /TestGoogleLoginButton/)
  assert.match(button, /Entrar na conta de teste/)
  assert.match(button, /renanguadalupe05@gmail\.com/)
  assert.match(button, /signInWithOAuth/)
  assert.match(button, /provider:\s*['"]google['"]/)
  assert.match(button, /\/auth\/google\/callback\?next=\/manage/)
})
