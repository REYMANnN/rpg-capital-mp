import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeOpenFactsPayload } from '../lib/inventory/catalog/providers/openFacts'
import { normalizeProductGuruPayload } from '../lib/inventory/catalog/providers/productGuru'
import { normalizeBarcodeFinderPayload } from '../lib/inventory/catalog/providers/barcodeFinder'
import { normalizeGtinSearchPayload } from '../lib/inventory/catalog/providers/gtinSearch'
import { normalizeUpcItemDbPayload } from '../lib/inventory/catalog/providers/upcItemDb'
import { normalizeProdutoXyzPayload } from '../lib/inventory/catalog/providers/produtoXyz'
import { normalizeBrocadePayload } from '../lib/inventory/catalog/providers/brocade'
import { normalizeEanPicturesPayload } from '../lib/inventory/catalog/providers/eanPictures'

const EAN = '7891000376843'

test('Open Facts Universal normalizes product identity and enrichment', () => {
  const hit = normalizeOpenFactsPayload(EAN, {
    status: 'success',
    product: {
      code: EAN,
      product_name_pt: 'Bono Chocolate 90g',
      brands: 'Nestlé',
      categories: 'Snacks, Biscoitos',
      image_front_url: 'https://images.example/bono.jpg',
      product_type: 'food',
    },
  })
  assert.equal(hit?.provider, 'OpenFacts')
  assert.equal(hit?.name, 'Bono Chocolate 90g')
  assert.equal(hit?.brand, 'Nestlé')
  assert.equal(hit?.imageUrl, 'https://images.example/bono.jpg')
  assert.equal(hit?.providerProductType, 'food')
  assert.equal(normalizeOpenFactsPayload(EAN, { status: 'failure' }), null)
})

test('ProductGuru normalizes identity, manufacturer, country and confidence', () => {
  const hit = normalizeProductGuruPayload(EAN, {
    product: {
      ean: EAN,
      name: 'Bono Chocolate 90g',
      brand: 'Nestlé',
      manufacturer: 'Nestlé Brasil',
      category: 'food',
      country: 'Brazil',
      certa_score: 84,
      image_url: 'https://images.example/guru.jpg',
    },
  })
  assert.equal(hit?.provider, 'ProductGuru')
  assert.equal(hit?.manufacturer, 'Nestlé Brasil')
  assert.equal(hit?.country, 'Brazil')
  assert.equal(hit?.providerConfidence, 0.84)
  assert.equal(normalizeProductGuruPayload(EAN, {}), null)
})

test('BarcodeFinder supports both documented response shapes', () => {
  const direct = normalizeBarcodeFinderPayload(EAN, {
    barcode: EAN,
    title: 'Samsung Galaxy A55',
    brand: 'Samsung',
    category: 'Electronics',
    description: 'Smartphone 5G',
    images: ['https://images.example/a55.jpg'],
    model: 'SM-A556',
    color: 'Navy',
    size: '128GB',
    weight: '213 g',
  })
  assert.equal(direct?.name, 'Samsung Galaxy A55')
  assert.equal(direct?.model, 'SM-A556')

  const nested = normalizeBarcodeFinderPayload(EAN, {
    product: { title: 'Samsung Galaxy A55', brand: 'Samsung', images: ['https://images.example/a55-2.jpg'] },
    barcodes: [{ value: EAN, type: 'EAN' }],
  })
  assert.equal(nested?.name, 'Samsung Galaxy A55')
  assert.equal(normalizeBarcodeFinderPayload(EAN, { product: {} }), null)
})

test('GTINSearch/Datakick normalizes common Datakick item fields', () => {
  const hit = normalizeGtinSearchPayload(EAN, {
    gtin14: '07891000376843',
    name: 'Bono Chocolate 90g',
    brand_name: 'Nestlé',
    description: 'Biscoito recheado',
    images: ['https://images.example/gtin.jpg'],
    size: '90g',
  })
  assert.equal(hit?.provider, 'GTINSearch')
  assert.equal(hit?.name, 'Bono Chocolate 90g')
  assert.equal(hit?.size, '90g')
  assert.equal(normalizeGtinSearchPayload(EAN, null), null)
})

test('UPCitemdb normalizes rich general-retail fields', () => {
  const hit = normalizeUpcItemDbPayload(EAN, {
    code: 'OK', total: 1,
    items: [{
      ean: EAN,
      title: 'Apple iPhone 6, Space Gray, 64 GB',
      brand: 'Apple', model: 'MG5A2LL/A', color: 'Space Gray', size: '64 GB',
      weight: '129 g', category: 'Electronics > Mobile Phones',
      description: 'Smartphone', images: ['https://images.example/iphone.jpg'],
    }],
  })
  assert.equal(hit?.provider, 'UPCitemdb')
  assert.equal(hit?.model, 'MG5A2LL/A')
  assert.equal(hit?.color, 'Space Gray')
  assert.equal(hit?.imageUrl, 'https://images.example/iphone.jpg')
  assert.equal(normalizeUpcItemDbPayload(EAN, { code: 'OK', total: 0, items: [] }), null)
})

test('Produto.xyz normalizes its documented Product wrapper', () => {
  const hit = normalizeProdutoXyzPayload(EAN, {
    Product: { gtin: EAN, name: 'DETERGENTE ECONOMICO NEUTRO 500ML', category: 'Limpeza', manufacturer: 'Fabricante X' },
  })
  assert.equal(hit?.provider, 'ProdutoXYZ')
  assert.equal(hit?.name, 'DETERGENTE ECONOMICO NEUTRO 500ML')
  assert.equal(hit?.manufacturer, 'Fabricante X')
  assert.equal(normalizeProdutoXyzPayload(EAN, { Product: {} }), null)
})

test('Brocade normalizes its documented flat read payload', () => {
  const hit = normalizeBrocadePayload(EAN, {
    gtin14: '07891000376843', brand_name: 'Ayam', name: 'Test Product', size: '90g', author: 'Author', publisher: 'Publisher', pages: 100,
  })
  assert.equal(hit?.provider, 'Brocade')
  assert.equal(hit?.name, 'Test Product')
  assert.equal(hit?.brand, 'Ayam')
  assert.equal(hit?.size, '90g')
  assert.equal(normalizeBrocadePayload(EAN, {}), null)
})

test('EanPictures normalizes Brazilian catalog aliases defensively', () => {
  const hit = normalizeEanPicturesPayload(EAN, {
    gtin: EAN,
    descricao: 'BISCOITO BONO CHOCOLATE 90G',
    marca: 'NESTLE',
    categoria: 'BISCOITOS',
    ncm: '19053100',
    cest: '1705400',
    embalagem: 'UN',
    quantidade: 1,
    peso: '90g',
  })
  assert.equal(hit?.provider, 'EanPictures')
  assert.equal(hit?.name, 'BISCOITO BONO CHOCOLATE 90G')
  assert.equal(hit?.ncm, '19053100')
  assert.equal(hit?.packageQuantity, 1)
  assert.match(hit?.imageUrl ?? '', /eanpictures\.com\.br:9000\/api\/gtin\/7891000376843/)
  assert.equal(normalizeEanPicturesPayload(EAN, {}), null)
})
