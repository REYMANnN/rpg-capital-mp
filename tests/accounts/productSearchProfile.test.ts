import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as inventoryCore from '../../lib/inventory/core.ts'

const root = process.cwd()

function source(path: string) {
  return readFileSync(join(root, path), 'utf8')
}

type SearchProduct = {
  id: string
  barcode: string
  scaleCode?: string
  name: string
  priceCents: number
  averageCostCents?: number
  stockMilli: number
  minStockMilli: number
}

test('product search finds items by accent-insensitive name, EAN, and scale code', () => {
  const searchProducts = (inventoryCore as unknown as {
    searchProducts?: (products: SearchProduct[], query: string) => SearchProduct[]
  }).searchProducts

  assert.equal(typeof searchProducts, 'function')
  if (!searchProducts) return

  const products: SearchProduct[] = [
    { id: 'coffee', barcode: '7891000000011', scaleCode: '101', name: 'Café Torrado', priceCents: 1990, averageCostCents: 1200, stockMilli: 8000, minStockMilli: 2000 },
    { id: 'soap', barcode: '7892000000022', name: 'Sabão em pó', priceCents: 1590, averageCostCents: 900, stockMilli: 5000, minStockMilli: 1000 },
  ]

  assert.deepEqual(searchProducts(products, 'cafe').map((product) => product.id), ['coffee'])
  assert.deepEqual(searchProducts(products, '7892000000022').map((product) => product.id), ['soap'])
  assert.deepEqual(searchProducts(products, '101').map((product) => product.id), ['coffee'])
  assert.deepEqual(searchProducts(products, '   ').map((product) => product.id), ['coffee', 'soap'])
})

test('stock and checkout share product search and can open the product profile', () => {
  const ui = source('app/inventory-v1/InventoryV1.tsx')
  const searchUses = ui.match(/<ProductSearch/g) ?? []

  assert.match(ui, /function ProductSearch/)
  assert.equal(searchUses.length, 2)
  assert.match(ui, /Buscar produto por nome ou código/)
  assert.match(ui, /Perfil do produto/)
  assert.match(ui, /Histórico do item/)
  assert.match(ui, /Custo médio/)
  assert.match(ui, /Margem bruta/)
})
