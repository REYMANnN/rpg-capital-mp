import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), 'utf8')

test('Pix checkout does not require the Vercel service-role secret', () => {
  const route = source('app/api/balcao/checkout/pix/route.ts')

  assert.match(route, /createServerClient/)
  assert.match(route, /balcao_checkout_pix_context/)
  assert.match(route, /INVENTORY_INSTALLATION_COOKIE/)
  assert.match(route, /balcao_businesses/)
  assert.doesNotMatch(route, /createAdminClient/)
  assert.doesNotMatch(route, /authorizeInventoryContext/)
})

test('Pix checkout preserves the Caixa total as the fixed QR amount', () => {
  const inventory = source('app/inventory-v1/InventoryV1.tsx')
  const route = source('app/api/balcao/checkout/pix/route.ts')

  assert.match(inventory, /JSON\.stringify\(\{ amountCents: total \}\)/)
  assert.match(route, /amountCents/)
  assert.match(route, /buildStaticPixPayload\(\{[\s\S]*amountCents,/)
})

test('Pix UI handles an empty or invalid server response without exposing JSON parser errors', () => {
  const inventory = source('app/inventory-v1/InventoryV1.tsx')

  assert.match(inventory, /await response\.text\(\)/)
  assert.doesNotMatch(inventory, /const result = await response\.json\(\)/)
  assert.match(inventory, /servidor respondeu/i)
})
