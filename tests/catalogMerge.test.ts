import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeCatalogCandidates } from '../lib/inventory/catalog/merge'

test('merges complementary provider fields into one canonical product', () => {
  const product = mergeCatalogCandidates('7891000376843', [
    { barcode: '7891000376843', provider: 'ProductGuru', name: 'Bono Chocolate 90g', brand: 'Nestlé', manufacturer: 'Nestlé Brasil' },
    { barcode: '7891000376843', provider: 'UPCitemdb', imageUrl: 'https://img.example/bono.jpg', categoryRaw: 'Food & Beverages' },
  ])

  assert.ok(product)
  assert.equal(product.name, 'Bono Chocolate 90g')
  assert.equal(product.brand, 'Nestlé')
  assert.equal(product.manufacturer, 'Nestlé Brasil')
  assert.equal(product.imageUrl, 'https://img.example/bono.jpg')
  assert.equal(product.categoryGeneral, 'Alimentos e bebidas')
  assert.ok(product.confidence >= 0 && product.confidence <= 1)
  assert.equal(product.provenance.name, 'ProductGuru')
  assert.equal(product.provenance.imageUrl, 'UPCitemdb')
})

test('manual BALCÃO identity outranks external candidates', () => {
  const product = mergeCatalogCandidates(
    '7891000376843',
    [{ barcode: '7891000376843', provider: 'ProductGuru', name: 'Nome externo', brand: 'Marca externa', imageUrl: 'https://external.example/a.jpg' }],
    { authority: 'manual', name: 'Nome corrigido', brand: 'Marca corrigida' },
  )

  assert.ok(product)
  assert.equal(product.name, 'Nome corrigido')
  assert.equal(product.brand, 'Marca corrigida')
  assert.equal(product.imageUrl, 'https://external.example/a.jpg')
  assert.equal(product.provenance.name, 'BALCAO')
})

test('candidate without any usable product name cannot resolve identity', () => {
  assert.equal(mergeCatalogCandidates('7891000376843', [
    { barcode: '7891000376843', provider: 'UPCitemdb', imageUrl: 'https://img.example/a.jpg' },
  ]), null)
})
