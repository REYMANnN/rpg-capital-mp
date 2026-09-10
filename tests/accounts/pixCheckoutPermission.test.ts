import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), 'utf8')

test('Pix checkout uses the same operational Caixa authorization context as the UI', () => {
  const route = source('app/api/balcao/checkout/pix/route.ts')

  assert.match(route, /authorizeInventoryContext/)
  assert.match(route, /INVENTORY_INSTALLATION_COOKIE/)
  assert.match(route, /checkout\.sell/)
  assert.match(route, /context\.mode\s*===\s*['"]staff['"]/)
  assert.doesNotMatch(route, /balcao_checkout_pix_context/)
})
