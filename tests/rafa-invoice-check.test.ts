import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { checkInvoice, checkLine, isValidCnpj, isValidGtin } from '../lib/rafa-invoice-check.ts'
import { prepareInvoiceImages } from '../lib/rafa-invoice-image.ts'
import type { InvoiceItem } from '../lib/rafa-ai-parse.ts'

const item = (description: string, q: number, vu: number, vt: number, ean?: string): InvoiceItem => ({
  description, quantity: q, unit_cost_cents: vu, total_cents: vt, ean: ean ?? null,
  confidence: { product: 1, quantity: 1, cost: 1 },
})

test('checkLine confere quantidade x unitário x total', () => {
  assert.equal(checkLine(item('OVOS', 1, 1790, 1799)).ok, false)
  assert.equal(checkLine(item('LEITE', 6, 479, 2874)).ok, true)
  assert.equal(checkLine(item('PRESUNTO', 0.528, 3590, 1895)).ok, true)
})

test('CNPJ usa os dois dígitos verificadores', () => {
  assert.equal(isValidCnpj('47508411000156'), true)
  assert.equal(isValidCnpj('11222333000181'), true)
  assert.equal(isValidCnpj('47508411058152'), false)
  assert.equal(isValidCnpj('47508411081152'), false)
})

test('GTIN usa dígito verificador', () => {
  assert.equal(isValidGtin('7891000100103'), true)
  assert.equal(isValidGtin('7896006800341'), false)
})

const NOTA: Array<[string, string, number, string, number, number]> = [
  ['7896006800341','ARROZ CAMIL T1 5KG',1,'UN',2990,2990],['7896022301158','FEIJAO KICALDO CARIOCA 1KG',2,'UN',849,1698],['7891025100123','ACUCAR UNIAO REFINADO 1KG',1,'UN',499,499],['7891000001142','CAFE 3 CORACOES EXTRA FORTE 500G',1,'UN',2490,2490],['7891249100211','OLEO SOJA LIZA 900ML',2,'UN',749,1498],['7896223000161','LEITE ITALAC INTEGRAL 1L',6,'UN',479,2874],['7896223000178','LEITE ITALAC DESNATADO 1L',2,'UN',499,998],['7891000283933','MACARRAO BARILLA ESPAGUETE 500G',2,'UN',899,1798],['7896706300124','MOLHO DE TOMATE HEINZ TRAD 340G',3,'UN',649,1947],['7891035001234','FARINHA DE TRIGO DONA BENTA 1KG',1,'UN',599,599],['7896006800020','SAL CISNE IODADO 1KG',1,'UN',249,249],['7622300991234','BISCOITO NESTLE PASSATEMPO 130G',2,'UN',399,798],['7891150054321','BISCOITO OREO ORIGINAL 90G',2,'UN',449,898],['7891000332211','MARGARINA QUALY C/SAL 500G',1,'UN',799,799],['7891035012345','MANTEIGA PRESIDENTE 200G',1,'UN',1290,1290],['7894900017890','OVOS BRANCOS GRANJA BRASIL C/20',1,'DZ',1790,1790],['7891058023456','PAO DE FORMA PULLMAN TRAD 500G',2,'UN',899,1798],['7894000056789','REFRIGERANTE COCA-COLA ORIGINAL 2L',3,'UN',949,2847],['7894900201234','CERVEJA BRAHMA LATA 350ML',12,'UN',329,3948],['7894900205678','AGUA MINERAL CRYSTAL S/GAS 1,5L',6,'UN',349,2094],['7896013030124','DETERGENTE YPE NEUTRO 500ML',2,'UN',249,498],['7896018901234','SABAO EM PO OMO LAVAGEM PERFEITA 800G',1,'UN',1690,1690],['7891024023456','PAPEL HIGIENICO NEVE FOLHA DUPLA 12UN',1,'UN',2490,2490],['7891176111111','PRESUNTO SADIA COZIDO KG',0.528,'KG',3590,1895],['7894900812345','MUSSARELA PRESIDENTE KG',0.412,'KG',4990,2056],['7891515523456','LINGUICA TOSCANA PERDIGAO KG',0.832,'KG',2890,2404],['7894900301998','CARNE BOVINA PATINHO KG',1.245,'KG',3690,4595],['7894900302889','PEITO DE FRANGO SADIA KG',1.032,'KG',1890,1949],
]

test('checkInvoice soma as 28 linhas corretas', () => {
  const extraction = { supplier_cnpj: null, items: NOTA.map(([code,d,q,u,vu,vt]) => ({ description:d, supplier_code:code, ean:null, quantity:q, unit_package:u, unit_cost_cents:vu, total_cents:vt, confidence:{product:1,quantity:1,cost:1} })) }
  const result = checkInvoice(extraction)
  assert.equal(result.lineResults.filter((line) => line.ok).length, 28)
  assert.equal(result.sumCents, 51479)
})

test('prepareInvoiceImages divide nota 740x1600 em faixas ampliadas', async () => {
  const source = await sharp({ create: { width: 740, height: 1600, channels: 3, background: { r: 245, g: 245, b: 245 } } }).png().toBuffer()
  const images = await prepareInvoiceImages(source)
  assert.ok(images.length === 2 || images.length === 3)
  for (const uri of images) {
    const bytes = Buffer.from(uri.split(',')[1], 'base64')
    const meta = await sharp(bytes).metadata()
    assert.ok((meta.width || 0) >= 1200)
    assert.ok((meta.height || 0) <= 3000)
  }
})
