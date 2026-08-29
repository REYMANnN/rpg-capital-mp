import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('app/inventory-v1/InventoryV1.tsx', 'utf8')

test('edit mode exposes delete-from-stock action and confirmation copy', () => {
  assert.match(source, /Apagar esse produto do meu estoque/)
  assert.match(source, /Quer mesmo apagar/)
  assert.match(source, /do seu estoque\?/)
  assert.match(source, /Apagar produto/)
  assert.match(source, /Cancelar/)
})

test('active product filtering is used for stock, intake and checkout', () => {
  assert.match(source, /const visibleProducts = useMemo/)
  assert.match(source, /products=\{visibleProducts\}/)
})

test('same deleted EAN can be reactivated instead of duplicated', () => {
  assert.match(source, /reactivateProduct/)
  assert.match(source, /Produto reativado/)
})
