import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const inventory = readFileSync(new URL('../app/inventory-v1/InventoryV1.tsx', import.meta.url), 'utf8')
const intake = readFileSync(new URL('../app/inventory-v1/InvoiceIntakeV10_1.tsx', import.meta.url), 'utf8')
const demoRoute = readFileSync(new URL('../app/api/inventory/nfe/by-key/route.ts', import.meta.url), 'utf8')
const version = readFileSync(new URL('../lib/inventory/version.ts', import.meta.url), 'utf8')

test('v10.2 brands the system as BALCÃO and shows the RPG System footer', () => {
  assert.match(inventory, />BALCÃO</)
  assert.match(inventory, /Powered by RPG System/)
  assert.match(version, /v10\.2/)
})

test('EAN scan resolution gives visible confirmation before advancing', () => {
  assert.match(intake, /scanConfirmation/)
  assert.match(intake, /Este código será salvo como/)
  assert.match(intake, /EAN \$\{barcode\}/)
})

test('demo invoice no longer includes the grain KG scenario', () => {
  assert.doesNotMatch(demoRoute, /DECIMAL-KG|PRODUTO GRANEL TESTE/)
  assert.match(demoRoute, /version: 'v10\.2'/)
})
