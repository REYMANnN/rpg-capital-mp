import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { completeSale } from '../../lib/inventory/core'

const root = process.cwd()
function source(path: string) {
  const full = join(root, path)
  assert.equal(existsSync(full), true, `${path} is missing`)
  return readFileSync(full, 'utf8')
}

const products = [{
  id: 'p1',
  barcode: '7891000000012',
  name: 'Produto teste',
  priceCents: 1000,
  averageCostCents: 600,
  stockMilli: 2000,
  minStockMilli: 0,
}]

test('completeSale persists an optional checkout payment method without changing stock arithmetic', () => {
  const result = completeSale(
    products,
    [{ productId: 'p1', quantityMilli: 1000 }],
    's1',
    { method: 'card', confirmedAt: '2026-09-10T12:00:00.000Z' },
  )

  assert.equal(result.sale.payment?.method, 'card')
  assert.equal(result.sale.payment?.confirmedAt, '2026-09-10T12:00:00.000Z')
  assert.equal(result.products[0].stockMilli, 1000)
  assert.equal(result.sale.totalCents, 1000)
  assert.equal(result.sale.cogsCents, 600)
  assert.equal(result.sale.grossProfitCents, 400)
})

test('legacy three-argument completeSale call remains valid', () => {
  const result = completeSale(products, [{ productId: 'p1', quantityMilli: 1000 }], 'legacy')
  assert.equal(result.sale.id, 'legacy')
  assert.equal('payment' in result.sale, false)
})

test('checkout source exposes one COBRAR action and Pix, Cartão, Dinheiro choices', () => {
  const checkout = source('app/inventory-v1/InventoryV1.tsx')
  assert.match(checkout, /COBRAR/)
  assert.match(checkout, /Como o cliente vai pagar\?/)
  assert.match(checkout, /Cartão/)
  assert.match(checkout, /Dinheiro/)
  assert.match(checkout, /Pagamento aprovado na maquininha/)
  assert.match(checkout, /finishSale\('pix'\)/)
  assert.doesNotMatch(checkout, /COBRAR NO PIX/)
})