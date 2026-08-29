import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanStringList, cleanText, normalizeBarcode } from '../lib/inventory/catalog/normalize'

test('normalizes usable retail barcodes and rejects invalid values', () => {
  assert.equal(normalizeBarcode(' 7891000376843 '), '7891000376843')
  assert.equal(normalizeBarcode(7891000376843), '7891000376843')
  assert.equal(normalizeBarcode('12345678'), '12345678')
  assert.equal(normalizeBarcode('12345678901234'), '12345678901234')
  assert.equal(normalizeBarcode('ABC789'), '')
  assert.equal(normalizeBarcode('1234567'), '')
  assert.equal(normalizeBarcode('123456789012345'), '')
})

test('cleans provider text and string lists without inventing values', () => {
  assert.equal(cleanText('  Samsung   Galaxy A55  '), 'Samsung Galaxy A55')
  assert.equal(cleanText(null), '')
  assert.deepEqual(cleanStringList([' a ', '', 'a', 'b', null]), ['a', 'b'])
  assert.deepEqual(cleanStringList('https://img.example/a.jpg'), ['https://img.example/a.jpg'])
})
