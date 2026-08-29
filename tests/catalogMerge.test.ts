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

test('more descriptive product name can beat a higher-ranked generic label', () => {
  const product = mergeCatalogCandidates('194252156940', [
    { barcode: '194252156940', provider: 'OpenFacts', name: 'Apple', imageUrl: 'https://img.example/apple.jpg' },
    { barcode: '194252156940', provider: 'UPCitemdb', name: 'Apple 20W USB-C Power Adapter', brand: 'Apple', model: 'MHJA3AM/A', categoryRaw: 'Electronics' },
  ])

  assert.ok(product)
  assert.equal(product.name, 'Apple 20W USB-C Power Adapter')
  assert.equal(product.brand, 'Apple')
  assert.equal(product.model, 'MHJA3AM/A')
  assert.equal(product.categoryGeneral, 'Eletrônicos')
  assert.equal(product.provenance.name, 'UPCitemdb')
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
