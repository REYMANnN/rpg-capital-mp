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
