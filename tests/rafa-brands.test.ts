import assert from 'node:assert/strict'
import test from 'node:test'
import { detectBrand, RETAIL_BRANDS } from '../lib/rafa-brands.ts'

test('dicionário tem no mínimo 150 marcas', () => assert.ok(RETAIL_BRANDS.length >= 150))
test('detectBrand encontra marcas explícitas e tolera erro', () => {
  assert.equal(detectBrand('SABAO EM PO OMO LAVAGEM PERFEITA 800G'), 'omo')
  assert.equal(detectBrand('LEITE ITALAC INTEGRAL 1L'), 'italac')
  assert.equal(detectBrand('LINGUICA TOSCANA PERDIGAO KG'), 'perdigao')
  assert.equal(detectBrand('ARROZ TIPO 1 5KG'), null)
  assert.equal(detectBrand('SABAO EM PO OM0 800G'), 'omo')
})
