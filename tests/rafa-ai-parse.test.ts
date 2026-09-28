import assert from 'node:assert/strict'
import test from 'node:test'

import {
  chunk,
  groqAudioFilename,
  groqAudioMime,
  mergeInvoiceExtractions,
  normalizeInvoiceExtraction,
  parseModelJson,
  toNumber,
} from '../lib/rafa-ai-parse.ts'

// ---------- Áudio ----------

test('áudio da Evolution (.oga) vira .ogg aceito pela Groq', () => {
  assert.equal(groqAudioFilename('audio/ogg; codecs=opus', '3EB0C431C26A1916E1C8.oga'), '3EB0C431C26A1916E1C8.ogg')
  assert.equal(groqAudioFilename('audio/ogg', null), 'audio.ogg')
  assert.equal(groqAudioMime('audio/ogg; codecs=opus', 'x.oga'), 'audio/ogg')
})

test('outros formatos de áudio mantêm extensão aceita', () => {
  assert.equal(groqAudioFilename('audio/mpeg', 'nota.mp3'), 'nota.mp3')
  assert.equal(groqAudioFilename('audio/mp4', 'gravacao'), 'gravacao.m4a')
  assert.equal(groqAudioFilename('application/octet-stream', 'x.opus'), 'x.ogg')
  assert.equal(groqAudioFilename('', 'voz.wav'), 'voz.wav')
})

// ---------- JSON ----------

test('parseModelJson aguenta <think>, cerca e texto em volta', () => {
  assert.deepEqual(parseModelJson('<think>hmm</think>{"a":1}'), { a: 1 })
  assert.deepEqual(parseModelJson('```json\n{"a":2}\n```'), { a: 2 })
  assert.deepEqual(parseModelJson('Segue: {"a":{"b":"}"}} fim'), { a: { b: '}' } })
  assert.equal(parseModelJson('{"a":[1,2'), null) // cortado no teto de tokens
  assert.equal(parseModelJson(''), null)
})

test('toNumber lê formato brasileiro', () => {
  assert.equal(toNumber('1.234,56'), 1234.56)
  assert.equal(toNumber('0,528'), 0.528)
  assert.equal(toNumber(29.9), 29.9)
  assert.equal(toNumber('abc'), null)
})

// ---------- Nota fiscal ----------

// Linhas da NFC-e de teste (Pão de Açúcar, 28 itens). Atenção: a soma das linhas impressas dá
// R$ 514,79, mas o rodapé da nota diz R$ 520,36 — a própria nota de teste é inconsistente.
const NOTA: Array<[string, string, number, string, number, number]> = [
  ['7896006800341', 'ARROZ CAMIL T1 5KG', 1, 'UN', 2990, 2990],
  ['7896022301158', 'FEIJAO KICALDO CARIOCA 1KG', 2, 'UN', 849, 1698],
  ['7891025100123', 'ACUCAR UNIAO REFINADO 1KG', 1, 'UN', 499, 499],
  ['7891000001142', 'CAFE 3 CORACOES EXTRA FORTE 500G', 1, 'UN', 2490, 2490],
  ['7891249100211', 'OLEO SOJA LIZA 900ML', 2, 'UN', 749, 1498],
  ['7896223000161', 'LEITE ITALAC INTEGRAL 1L', 6, 'UN', 479, 2874],
  ['7896223000178', 'LEITE ITALAC DESNATADO 1L', 2, 'UN', 499, 998],
  ['7891000283933', 'MACARRAO BARILLA ESPAGUETE 500G', 2, 'UN', 899, 1798],
  ['7896706300124', 'MOLHO DE TOMATE HEINZ TRAD 340G', 3, 'UN', 649, 1947],
  ['7891035001234', 'FARINHA DE TRIGO DONA BENTA 1KG', 1, 'UN', 599, 599],
  ['7896006800020', 'SAL CISNE IODADO 1KG', 1, 'UN', 249, 249],
  ['7622300991234', 'BISCOITO NESTLE PASSATEMPO 130G', 2, 'UN', 399, 798],
  ['7891150054321', 'BISCOITO OREO ORIGINAL 90G', 2, 'UN', 449, 898],
  ['7891000332211', 'MARGARINA QUALY C/SAL 500G', 1, 'UN', 799, 799],
  ['7891035012345', 'MANTEIGA PRESIDENTE 200G', 1, 'UN', 1290, 1290],
  ['7894900017890', 'OVOS BRANCOS GRANJA BRASIL C/20', 1, 'DZ', 1790, 1790],
  ['7891058023456', 'PAO DE FORMA PULLMAN TRAD 500G', 2, 'UN', 899, 1798],
  ['7894000056789', 'REFRIGERANTE COCA-COLA ORIGINAL 2L', 3, 'UN', 949, 2847],
  ['7894900201234', 'CERVEJA BRAHMA LATA 350ML', 12, 'UN', 329, 3948],
  ['7894900205678', 'AGUA MINERAL CRYSTAL S/GAS 1,5L', 6, 'UN', 349, 2094],
  ['7896013030124', 'DETERGENTE YPE NEUTRO 500ML', 2, 'UN', 249, 498],
  ['7896018901234', 'SABAO EM PO OMO LAVAGEM PERFEITA 800G', 1, 'UN', 1690, 1690],
  ['7891024023456', 'PAPEL HIGIENICO NEVE FOLHA DUPLA 12UN', 1, 'UN', 2490, 2490],
  ['7891176111111', 'PRESUNTO SADIA COZIDO KG', 0.528, 'KG', 3590, 1895],
  ['7894900812345', 'MUSSARELA PRESIDENTE KG', 0.412, 'KG', 4990, 2056],
  ['7891515523456', 'LINGUICA TOSCANA PERDIGAO KG', 0.832, 'KG', 2890, 2404],
  ['7894900301998', 'CARNE BOVINA PATINHO KG', 1.245, 'KG', 3690, 4595],
  ['7894900302889', 'PEITO DE FRANGO SADIA KG', 1.032, 'KG', 1890, 1949],
]

test('formato compacto (chaves curtas) da nota vira itens completos', () => {
  const raw = JSON.stringify({
    f: 'PÃO DE AÇÚCAR',
    cnpj: '47.508.411/0581-52',
    i: NOTA.map(([sc, d, q, u, vu, vt]) => ({ d, sc, e: sc, q, u, vu, vt, cp: 0.95, cq: 0.95, cc: 0.9 })),
  })
  const out = normalizeInvoiceExtraction(raw)
  assert.equal(out.supplier_cnpj, '47508411058152')
  assert.equal(out.items.length, 28)
  const soma = out.items.reduce((s, item) => s + (item.total_cents || 0), 0)
  assert.equal(soma, 51479)
  assert.equal(out.items[23].quantity, 0.528)
  assert.equal(out.items[0].ean, '7896006800341')
  assert.deepEqual(out.items[0].confidence, { product: 0.95, quantity: 0.95, cost: 0.9 })
})

test('aceita "itens" em português, valores em reais e aninhado', () => {
  const out = normalizeInvoiceExtraction({
    nota: {
      fornecedor_nome: 'X',
      itens: [{ descricao: 'ARROZ', quantidade: '1', valor_unitario: '29,90', valor_total: 29.9, codigo: 'ABC' }],
    },
  })
  assert.equal(out.items.length, 1)
  assert.equal(out.items[0].unit_cost_cents, 2990)
  assert.equal(out.items[0].total_cents, 2990)
  assert.equal(out.items[0].supplier_code, 'ABC')
  assert.equal(out.items[0].ean, null)
})

test('formato longo antigo continua funcionando', () => {
  const out = normalizeInvoiceExtraction({
    supplier_name: 'Y', supplier_cnpj: '12345678000199',
    items: [{ description: 'CAFE', ean: '7891000001142', quantity: 1, unit_cost_cents: 2490, total_cents: 2490, confidence: { product: 0.9, quantity: 1, cost: 0.8 } }],
  })
  assert.equal(out.items[0].unit_cost_cents, 2490)
  assert.equal(out.supplier_cnpj, '12345678000199')
})

test('centavos mandados como reais (29.9) são corrigidos', () => {
  const out = normalizeInvoiceExtraction({ i: [{ d: 'A', vu: 29.9, vt: 59.8, q: 2 }] })
  assert.equal(out.items[0].unit_cost_cents, 2990)
  assert.equal(out.items[0].total_cents, 5980)
})

test('lista ausente ou lixo = zero itens, sem quebrar', () => {
  assert.equal(normalizeInvoiceExtraction('{"f":"X"}').items.length, 0)
  assert.equal(normalizeInvoiceExtraction('não é json').items.length, 0)
  assert.equal(normalizeInvoiceExtraction({ i: [{}, null, 3] }).items.length, 0)
})

test('lotes de 3 fotos são juntados numa nota só', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 3), [[1, 2, 3], [4, 5]])
  const merged = mergeInvoiceExtractions([
    { supplier_name: 'A', supplier_cnpj: '1', items: [{ description: 'x', confidence: { product: 1, quantity: 1, cost: 1 } }] },
    { supplier_name: null, supplier_cnpj: null, items: [{ description: 'y', confidence: { product: 1, quantity: 1, cost: 1 } }] },
  ])
  assert.equal(merged.items.length, 2)
  assert.equal(merged.supplier_name, 'A')
})
