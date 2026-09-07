import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return fs.readFileSync(path, 'utf8')
}

test('legacy public home remains available while the root serves the Balcoes landing', () => {
  const root = source('app/page.tsx')
  const home = source('app/home/page.tsx')

  assert.doesNotMatch(root, /redirect\(['"]\/home['"]\)/)
  assert.match(root, /RPG para Balcões/)
  assert.match(home, /Minha Conta/)
})

test('public home offers existing-account and fresh signup paths', () => {
  const home = source('app/home/page.tsx')

  assert.match(home, /Minha Conta/)
  assert.match(home, /Criar Conta/)
  assert.match(home, /\/login\?intent=login/)
  assert.match(home, /\/auth\/signup\/reset/)
  assert.doesNotMatch(home, /href=["']\/login\?intent=signup["']/)
})

test('public home keeps a temporary test-account button that goes straight to manage', () => {
  const home = source('app/home/page.tsx')
  const button = source('components/accounts/TestGoogleLoginButton.tsx')

  assert.match(home, /TestGoogleLoginButton/)
  assert.match(button, /Entrar na conta de teste/)
  assert.match(button, /href=["']\/manage["']/)
  assert.doesNotMatch(button, /signInWithOAuth/)
  assert.doesNotMatch(button, /provider:\s*['"]google['"]/)
  assert.doesNotMatch(button, /\/login\?intent=/)
})
