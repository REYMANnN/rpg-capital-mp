import assert from 'node:assert/strict'
import test from 'node:test'

import { buildImportPlan, detectColumns, findHeader, importSummaryMessage, parseCsv, parseNumberBR, tableToText } from '../../lib/rafa-import.ts'

const state = {
  products: [
    { id: 'p1', barcode: '7894900011517', name: 'Coca-Cola 2L', priceCents: 1199, averageCostCents: 780, stockMilli: 4000, minStockMilli: 6000 },
    { id: 'p2', barcode: '7896005800010', name: 'Arroz Tio João 5kg', priceCents: 2990, averageCostCents: 2250, stockMilli: 0, minStockMilli: 3000 },
  ],
  sales: [],
  movements: [],
} as never

test('numbers in Brazilian format', () => {
  assert.equal(parseNumberBR('R$ 1.234,56'), 1234.56)
  assert.equal(parseNumberBR('12,5'), 12.5)
  assert.equal(parseNumberBR('12.50'), 12.5)
  assert.equal(parseNumberBR(7), 7)
  assert.equal(parseNumberBR(''), null)
  assert.equal(parseNumberBR('abc'), null)
})

test('csv with semicolon, quotes and header detection', () => {
  const rows = parseCsv('Lista de produtos\nProduto;EAN;Preço (R$);Custo;Estoque\n"Coca-Cola 2L";7894900011517;12,49;7,80;10\n')
  assert.equal(rows.length, 3)
  const header = findHeader(rows)
  assert.ok(header)
  assert.equal(header!.index, 1)
  assert.deepEqual(detectColumns(rows[1]), { nome: 0, ean: 1, preco: 2, custo: 3, estoque: 4 })
})

test('import plan updates existing, creates new, skips incomplete', () => {
  const rows = [
    ['Produto', 'EAN', 'Preço', 'Custo', 'Estoque'],
    ['Coca-Cola 2L', '7894900011517', '12,49', '7,80', '10'],
    ['Arroz Tio João 5kg', '7896005800010', '29,90', '22,50', '0'],
    ['Feijão Camil 1kg', '7896006713012', '8,99', '6,40', '12'],
    ['Sem código', '', '5,00', '3,00', '1'],
    ['Biscoito', '7891000100103', '4,50', '', '3'],
  ]
  const plan = buildImportPlan(state, rows, findHeader(rows)!)
  assert.equal(plan.rows, 5)
  assert.equal(plan.priceUpdates, 1)
  assert.equal(plan.stockUpdates, 1)
  assert.equal(plan.newProducts, 1)
  assert.equal(plan.unchanged, 1)
  assert.equal(plan.skipped.length, 2)
  const created = plan.changes.find((change) => change.kind === 'cadastrar')
  assert.ok(created && created.kind === 'cadastrar' && created.priceCents === 899 && created.costCents === 640 && created.stockMilli === 12000)
  const message = importSummaryMessage(plan, 'lista.xlsx')
  assert.match(message, /Cadastrar 1 produto/)
  assert.match(message, /Vou pular 2/)
})

test('entrada mode adds quantity instead of setting stock', () => {
  const rows = [['Produto', 'EAN', 'Qtd', 'Custo'], ['Coca-Cola 2L', '7894900011517', '6', '8,00']]
  const plan = buildImportPlan(state, rows, findHeader(rows)!, 'entrada')
  assert.equal(plan.entries, 1)
  const entry = plan.changes[0]
  assert.ok(entry.kind === 'entrada' && entry.quantityMilli === 6000 && entry.unitCostCents === 800)
})

test('table text is bounded', () => {
  const rows = Array.from({ length: 400 }, (_, i) => [`item ${i}`, String(i)])
  const text = tableToText(rows, 150)
  assert.match(text, /mais 250 linhas/)
})
