import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeInvoiceBarcode, parseNfeXml } from '../lib/inventory/nfe.ts'

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe Id="NFe351234">
    <ide><nNF>12345</nNF><dhEmi>2026-08-27T10:00:00-03:00</dhEmi></ide>
    <emit><xNome>Distribuidora Teste LTDA</xNome><CNPJ>12345678000190</CNPJ></emit>
    <det nItem="1"><prod>
      <cProd>ABC-01</cProd><cEAN>7891000100103</cEAN><xProd>LEITE CONDENSADO</xProd>
      <qCom>12.0000</qCom><vUnCom>6.4200000000</vUnCom><vProd>77.04</vProd>
    </prod></det>
    <det nItem="2"><prod>
      <cProd>ABC-02</cProd><cEAN>SEM GTIN</cEAN><cEANTrib>7894900011517</cEANTrib><xProd>REFRIGERANTE</xProd>
      <qCom>6.0000</qCom><vUnCom>4.50</vUnCom><vProd>27.00</vProd>
    </prod></det>
    <det nItem="3"><prod>
      <cProd>ABC-03</cProd><cEAN>SEM GTIN</cEAN><cEANTrib>SEM GTIN</cEANTrib><xProd>PRODUTO SEM GTIN</xProd>
      <qCom>2</qCom><vUnCom>3.10</vUnCom><vProd>6.20</vProd>
    </prod></det>
  </infNFe></NFe>
</nfeProc>`

test('normalizes only usable GTIN barcodes', () => {
  assert.equal(normalizeInvoiceBarcode(' 7891000100103 '), '7891000100103')
  assert.equal(normalizeInvoiceBarcode('SEM GTIN'), '')
  assert.equal(normalizeInvoiceBarcode('123'), '')
})

test('parses NF-e purchase header, access key and item money/quantity as integers', () => {
  const parsed = parseNfeXml(xml)
  assert.equal(parsed.accessKey, '351234')
  assert.equal(parsed.number, '12345')
  assert.equal(parsed.supplierName, 'Distribuidora Teste LTDA')
  assert.equal(parsed.supplierDocument, '12345678000190')
  assert.equal(parsed.items.length, 3)

  assert.deepEqual(parsed.items[0], {
    line: 1,
    supplierCode: 'ABC-01',
    barcode: '7891000100103',
    description: 'LEITE CONDENSADO',
    quantityMilli: 12000,
    unitCostCents: 642,
    totalCents: 7704,
  })
})

test('uses cEANTrib when cEAN is unavailable and keeps missing GTIN item pending', () => {
  const parsed = parseNfeXml(xml)
  assert.equal(parsed.items[1].barcode, '7894900011517')
  assert.equal(parsed.items[2].barcode, '')
})

test('rejects malformed or empty invoice XML', () => {
  assert.throws(() => parseNfeXml('<broken>'), /XML|NF-e/i)
  assert.throws(() => parseNfeXml('<NFe><infNFe></infNFe></NFe>'), /item|NF-e/i)
})
