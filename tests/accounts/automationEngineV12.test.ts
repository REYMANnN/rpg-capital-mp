import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateRecipe } from '../../lib/platform/automation/engine'
import type { PlatformInventoryState } from '../../lib/platform/inventoryAdapter'

const now = new Date('2026-09-12T12:00:00.000Z')
const day = 86_400_000

function state(overrides: Partial<PlatformInventoryState> = {}): PlatformInventoryState {
  return { products: [], sales: [], movements: [], ...overrides }
}
function sale(daysAgo:number,totalCents:number,items:any[]=[]){return{id:`s-${daysAgo}-${totalCents}`,createdAt:new Date(now.getTime()-daysAgo*day).toISOString(),totalCents,cogsCents:0,grossProfitCents:totalCents,items}}

test('margin protection recommends a bounded higher price when gross margin falls below the floor', () => {
  const findings = evaluateRecipe('margin_protection', state({ products:[{id:'p1',name:'Produto',priceCents:1000,averageCostCents:800,stockMilli:10000,minStockMilli:1000}] }), { minimumMarginPct:25,targetMarginPct:30,maxChangePct:5 }, now)
  assert.equal(findings.length,1)
  assert.equal(findings[0].entityId,'p1')
  assert.equal(findings[0].recommendation?.type,'price')
  assert.ok((findings[0].recommendation?.recommendedPriceCents ?? 0) > 1000)
  assert.ok((findings[0].recommendation?.recommendedPriceCents ?? 0) <= 1050)
})

test('low stock flags products at or below their registered minimum', () => {
  const findings = evaluateRecipe('low_stock', state({ products:[{id:'p1',name:'Água',priceCents:300,averageCostCents:150,stockMilli:2000,minStockMilli:3000}] }), {}, now)
  assert.equal(findings.length,1)
  assert.equal(findings[0].recipeKey,'low_stock')
  assert.equal(findings[0].metrics.stockMilli,2000)
})

test('stockout risk uses 30-day velocity and current stock to estimate coverage', () => {
  const sales = Array.from({length:10},(_,i)=>sale(i+1,1000,[{productId:'p1',quantityMilli:3000}]))
  const findings = evaluateRecipe('stockout_risk', state({ products:[{id:'p1',name:'Leite',priceCents:500,averageCostCents:300,stockMilli:3000,minStockMilli:1000}],sales }), {days:7,minimumSales30d:3}, now)
  assert.equal(findings.length,1)
  assert.ok(Number(findings[0].metrics.daysOfInventory) <= 7)
})

test('stagnant stock finds products with stock and almost no recent sales', () => {
  const findings = evaluateRecipe('stagnant_stock', state({ products:[{id:'p1',name:'Molho',priceCents:900,averageCostCents:500,stockMilli:25000,minStockMilli:1000}],sales:[] }), {maxSales30d:2,minimumStockUnits:1}, now)
  assert.equal(findings.length,1)
  assert.equal(findings[0].metrics.unitsSold30d,0)
  assert.ok(Number(findings[0].metrics.inventoryCostCents) > 0)
})

test('sales drop compares the current seven-day window against the preceding seven days', () => {
  const sales = [
    sale(1,1000), sale(2,1000), sale(3,1000),
    sale(8,5000), sale(9,5000), sale(10,5000),
  ]
  const findings = evaluateRecipe('sales_drop', state({sales}), {dropPct:20,minimumPreviousRevenueCents:10000}, now)
  assert.equal(findings.length,1)
  assert.equal(findings[0].recipeKey,'sales_drop')
  assert.ok(Number(findings[0].metrics.changePct) < -20)
})

test('daily summary never fabricates financial movement and only summarizes recorded sales', () => {
  const sales = [sale(0,2500,[{productId:'p1',quantityMilli:2000}]),sale(1,9999)]
  const findings = evaluateRecipe('daily_summary', state({sales}), {}, now)
  assert.equal(findings.length,1)
  assert.equal(findings[0].metrics.salesCount,1)
  assert.equal(findings[0].metrics.revenueCents,2500)
})
