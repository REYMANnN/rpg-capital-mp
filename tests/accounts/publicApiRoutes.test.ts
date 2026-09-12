import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const route = (path: string) => join(root, `app/api/public/v1/${path}/route.ts`)

test('public v1 exposes read, export and ingest surfaces without money movement routes', () => {
  for (const path of ['products','inventory','inventory/movements','sales','finance/summary','finance/transactions','finance/card-settlements','pricing/recommendations','pricing/history','imports/products','imports/sales','imports/inventory-movements','exports/products.csv','exports/inventory.csv','exports/sales.csv','exports/transactions.csv']) assert.equal(existsSync(route(path)), true, path)
  for (const forbidden of ['pix','payments','transfers','wallet','bank/write']) assert.equal(existsSync(route(forbidden)), false, forbidden)
})

test('public finance and imports demand explicit scopes and imports use idempotency', () => {
  const finance = readFileSync(route('finance/summary'), 'utf8')
  const salesImport = readFileSync(route('imports/sales'), 'utf8')
  assert.match(finance, /finance:read/)
  assert.match(salesImport, /sales:ingest/)
  assert.match(salesImport, /Idempotency-Key/i)
})
