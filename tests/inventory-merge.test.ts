import assert from 'node:assert/strict'
import test from 'node:test'

import { mergeStoreStates } from '../lib/inventory/merge.ts'

const p = (id: string, stockMilli: number, priceCents = 1000, extra: Record<string, unknown> = {}) => ({ id, name: id, stockMilli, priceCents, averageCostCents: 500, ...extra })
const st = (products: unknown[], sales: unknown[] = [], movements: unknown[] = []) => ({ products, sales, movements, scaleRule: {} }) as never

test('venda na tela + entrada da Rafa ao mesmo tempo: as duas contam', () => {
  const base = st([p('coca', 10_000)])
  const local = st([p('coca', 8_000)], [{ id: 'venda1' }], [{ id: 'mv-venda' }])
  const remote = st([p('coca', 22_000, 1000, { averageCostCents: 450 })], [], [{ id: 'mv-nota' }])
  const merged = mergeStoreStates(base, local, remote) as any
  assert.equal(merged.products[0].stockMilli, 20_000)
  assert.equal(merged.products[0].averageCostCents, 450)
  assert.deepEqual(merged.sales.map((s: any) => s.id), ['venda1'])
  assert.deepEqual(merged.movements.map((m: any) => m.id).sort(), ['mv-nota', 'mv-venda'])
})

test('preço mudado na tela vence; preço mudado fora fica se a tela não mexeu', () => {
  const base = st([p('a', 1000, 100), p('b', 1000, 200)])
  const local = st([p('a', 1000, 150), p('b', 1000, 200)])
  const remote = st([p('a', 1000, 120), p('b', 1000, 260)])
  const merged = mergeStoreStates(base, local, remote) as any
  assert.equal(merged.products.find((x: any) => x.id === 'a').priceCents, 150)
  assert.equal(merged.products.find((x: any) => x.id === 'b').priceCents, 260)
})

test('produto novo dos dois lados entra; apagado na tela sai', () => {
  const base = st([p('a', 1000), p('b', 1000)])
  const local = st([p('a', 1000), p('novo-tela', 5000)])
  const remote = st([p('a', 1000), p('b', 1000), p('novo-rafa', 3000)])
  const ids = (mergeStoreStates(base, local, remote) as any).products.map((x: any) => x.id).sort()
  assert.deepEqual(ids, ['a', 'novo-rafa', 'novo-tela'])
})
