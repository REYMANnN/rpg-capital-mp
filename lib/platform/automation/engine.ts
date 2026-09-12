import type { PlatformInventoryState } from '@/lib/platform/inventoryAdapter'
import { AUTOMATION_RECIPES, type AutomationRecipeKey } from './recipes'

export type AutomationFinding = {
  id: string
  recipeKey: AutomationRecipeKey
  severity: 'info'|'warning'|'critical'
  title: string
  description: string
  entityType?: 'product'|'store'
  entityId?: string
  entityName?: string
  metrics: Record<string, number|string|boolean|null>
  recommendation?: { type:'price'|'replenishment'; recommendedPriceCents?:number; currentPriceCents?:number; quantityMilli?:number; confidence?:'low'|'medium'|'high' }
}

const DAY=86_400_000
const n=(value:unknown, fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback
const pct=(price:number,cost:number)=>price>0?(price-cost)*100/price:0
const psychological=(cents:number)=>cents<=100?Math.max(1,cents):Math.max(1,Math.ceil(cents/10)*10-1)
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value))
const at=(value:unknown)=>{const time=new Date(String(value??'')).getTime();return Number.isFinite(time)?time:0}

function soldByProduct(state:PlatformInventoryState, since:number){
  const sold=new Map<string,number>()
  for(const sale of state.sales){if(at((sale as any).createdAt)<since)continue;for(const item of (sale as any).items??[]){const id=String(item.productId);sold.set(id,(sold.get(id)??0)+n(item.quantityMilli))}}
  return sold
}
function revenueBetween(state:PlatformInventoryState,from:number,to:number){return state.sales.reduce((sum:number,sale:any)=>{const time=at(sale.createdAt);return time>=from&&time<to?sum+n(sale.totalCents):sum},0)}
function configNumber(config:Record<string,unknown>,key:string,fallback:number){const value=n(config[key],fallback);return value>=0?value:fallback}
function productName(product:any){return String(product.name??'Produto')}
function findingId(recipe:AutomationRecipeKey,entity:string){return `${recipe}:${entity}`}

export function evaluateRecipe(recipeKey:AutomationRecipeKey,state:PlatformInventoryState,config:Record<string,unknown>={},now=new Date()):AutomationFinding[]{
  const nowMs=now.getTime(), sold30=soldByProduct(state,nowMs-30*DAY)
  const products=state.products.filter((p:any)=>!p.deletedAt)
  if(recipeKey==='margin_protection'){
    const floor=configNumber(config,'minimumMarginPct',25), target=configNumber(config,'targetMarginPct',30), maxChange=configNumber(config,'maxChangePct',5)
    return products.flatMap((p:any)=>{const price=Math.round(n(p.priceCents)),cost=Math.round(n(p.averageCostCents));if(price<=0||cost<=0)return[];const margin=pct(price,cost);if(margin>=floor)return[];const ideal=cost/Math.max(.05,1-target/100),recommended=psychological(Math.round(clamp(ideal,price*(1-maxChange/100),price*(1+maxChange/100))));return[{id:findingId(recipeKey,String(p.id)),recipeKey,severity:margin<Math.max(5,floor-10)?'critical':'warning',title:`Margem baixa em ${productName(p)}`,description:`Margem atual de ${margin.toFixed(1)}%. O limite configurado é ${floor.toFixed(0)}%.`,entityType:'product',entityId:String(p.id),entityName:productName(p),metrics:{currentMarginPct:Number(margin.toFixed(2)),minimumMarginPct:floor,targetMarginPct:target,costCents:cost,currentPriceCents:price,recommendedPriceCents:recommended},recommendation:{type:'price',currentPriceCents:price,recommendedPriceCents:recommended,confidence:'high'}}]})
  }
  if(recipeKey==='smart_pricing'){
    const floor=configNumber(config,'minimumMarginPct',25),target=configNumber(config,'targetMarginPct',30),maxChange=configNumber(config,'maxChangePct',5),minSales=configNumber(config,'minimumSalesCount',20),stockout=configNumber(config,'stockoutDays',7),excess=configNumber(config,'excessDays',60)
    return products.flatMap((p:any)=>{const price=Math.round(n(p.priceCents)),cost=Math.max(0,Math.round(n(p.averageCostCents))),soldMilli=sold30.get(String(p.id))??0,units=soldMilli/1000,daily=units/30,stockUnits=n(p.stockMilli)/1000,days=daily>0?stockUnits/daily:null,margin=pct(price,cost);if(price<=0)return[];let raw=price;const reasons:string[]=[];if(cost>0&&margin<floor){raw=Math.max(raw,cost/Math.max(.05,1-target/100));reasons.push('margem abaixo do limite')}if(days!==null&&days<stockout&&units>=Math.max(3,minSales/2)&&margin<45){raw=Math.max(raw,price*1.03);reasons.push('giro forte e cobertura baixa')}if(days!==null&&days>excess&&margin>35&&units>=3){raw=Math.min(raw,price*.97);reasons.push('estoque alto para o giro atual')}if(!reasons.length)return[];const lower=cost>0?Math.max(cost/Math.max(.05,1-floor/100),price*(1-maxChange/100)):price*(1-maxChange/100),upper=price*(1+maxChange/100),recommended=psychological(Math.round(clamp(raw,lower,upper))),confidence:'low'|'medium'|'high'=units>=60?'high':units>=minSales?'medium':'low';if(recommended===price)return[];return[{id:findingId(recipeKey,String(p.id)),recipeKey,severity:'info',title:`Preço de ${productName(p)} merece atenção`,description:reasons.join(' · '),entityType:'product',entityId:String(p.id),entityName:productName(p),metrics:{currentMarginPct:Number(margin.toFixed(2)),daysOfInventory:days===null?null:Number(days.toFixed(1)),unitsSold30d:Number(units.toFixed(3)),currentPriceCents:price,recommendedPriceCents:recommended,costCents:cost},recommendation:{type:'price',currentPriceCents:price,recommendedPriceCents:recommended,confidence}}]})
  }
  if(recipeKey==='low_stock') return products.flatMap((p:any)=>n(p.stockMilli)<=n(p.minStockMilli)&&n(p.minStockMilli)>0?[{id:findingId(recipeKey,String(p.id)),recipeKey,severity:n(p.stockMilli)<=0?'critical':'warning',title:`Estoque baixo: ${productName(p)}`,description:`Restam ${(n(p.stockMilli)/1000).toFixed(3)} unidades; mínimo cadastrado ${(n(p.minStockMilli)/1000).toFixed(3)}.`,entityType:'product',entityId:String(p.id),entityName:productName(p),metrics:{stockMilli:n(p.stockMilli),minStockMilli:n(p.minStockMilli)}}]:[])
  if(recipeKey==='stockout_risk'){
    const threshold=configNumber(config,'days',7),minSales=configNumber(config,'minimumSales30d',3)
    return products.flatMap((p:any)=>{const units=(sold30.get(String(p.id))??0)/1000,daily=units/30;if(units<minSales||daily<=0)return[];const days=(n(p.stockMilli)/1000)/daily;if(days>threshold)return[];return[{id:findingId(recipeKey,String(p.id)),recipeKey,severity:days<=3?'critical':'warning',title:`${productName(p)} pode acabar em breve`,description:`No ritmo atual, o estoque cobre aproximadamente ${Math.max(0,days).toFixed(1)} dias.`,entityType:'product',entityId:String(p.id),entityName:productName(p),metrics:{daysOfInventory:Number(days.toFixed(1)),unitsSold30d:units,stockMilli:n(p.stockMilli)}}]})
  }
  if(recipeKey==='stagnant_stock'){
    const maxSales=configNumber(config,'maxSales30d',2),minStock=configNumber(config,'minimumStockUnits',1)
    return products.flatMap((p:any)=>{const units=(sold30.get(String(p.id))??0)/1000,stock=n(p.stockMilli)/1000;if(stock<minStock||units>maxSales)return[];return[{id:findingId(recipeKey,String(p.id)),recipeKey,severity:'warning',title:`Estoque parado: ${productName(p)}`,description:`Há ${stock.toFixed(3)} unidades em estoque e apenas ${units.toFixed(3)} vendidas nos últimos 30 dias.`,entityType:'product',entityId:String(p.id),entityName:productName(p),metrics:{stockUnits:stock,unitsSold30d:units,inventoryCostCents:Math.round(stock*n(p.averageCostCents))}}]})
  }
  if(recipeKey==='excess_stock'){
    const threshold=configNumber(config,'days',60),minSales=configNumber(config,'minimumSales30d',3)
    return products.flatMap((p:any)=>{const units=(sold30.get(String(p.id))??0)/1000,daily=units/30;if(units<minSales||daily<=0)return[];const days=(n(p.stockMilli)/1000)/daily;if(days<threshold)return[];return[{id:findingId(recipeKey,String(p.id)),recipeKey,severity:'warning',title:`Cobertura alta: ${productName(p)}`,description:`O estoque atual representa aproximadamente ${days.toFixed(0)} dias de vendas.`,entityType:'product',entityId:String(p.id),entityName:productName(p),metrics:{daysOfInventory:Number(days.toFixed(1)),unitsSold30d:units,stockMilli:n(p.stockMilli)}}]})
  }
  if(recipeKey==='replenishment'){
    const reorder=configNumber(config,'reorderAtDays',7),target=configNumber(config,'targetDays',30),minSales=configNumber(config,'minimumSales30d',3)
    return products.flatMap((p:any)=>{const units=(sold30.get(String(p.id))??0)/1000,daily=units/30;if(units<minSales||daily<=0)return[];const stock=n(p.stockMilli)/1000,days=stock/daily;if(days>reorder)return[];const qty=Math.max(0,Math.ceil((daily*target-stock)*1000));return[{id:findingId(recipeKey,String(p.id)),recipeKey,severity:days<=3?'critical':'warning',title:`Repor ${productName(p)}`,description:`Para chegar a ${target.toFixed(0)} dias de cobertura, a sugestão é repor ${(qty/1000).toFixed(3)} unidades.`,entityType:'product',entityId:String(p.id),entityName:productName(p),metrics:{daysOfInventory:Number(days.toFixed(1)),targetDays:target,quantityMilli:qty},recommendation:{type:'replenishment',quantityMilli:qty}}]})
  }
  if(recipeKey==='missing_cost') return products.flatMap((p:any)=>{const units=(sold30.get(String(p.id))??0)/1000;if(n(p.averageCostCents)>0||(n(p.stockMilli)<=0&&units<=0))return[];return[{id:findingId(recipeKey,String(p.id)),recipeKey,severity:'critical',title:`Custo ausente: ${productName(p)}`,description:'Sem um custo confiável, margem e lucro deste produto podem ficar incorretos.',entityType:'product',entityId:String(p.id),entityName:productName(p),metrics:{stockMilli:n(p.stockMilli),unitsSold30d:units}}]})
  if(recipeKey==='sales_drop'){
    const current=revenueBetween(state,nowMs-7*DAY,nowMs),previous=revenueBetween(state,nowMs-14*DAY,nowMs-7*DAY),minimum=configNumber(config,'minimumPreviousRevenueCents',10000),drop=configNumber(config,'dropPct',20);if(previous<minimum)return[];const change=(current-previous)*100/previous;if(change>-drop)return[];return[{id:findingId(recipeKey,'store'),recipeKey,severity:change<=-35?'critical':'warning',title:'Vendas desaceleraram',description:`A receita dos últimos 7 dias está ${Math.abs(change).toFixed(1)}% abaixo dos 7 dias anteriores.`,entityType:'store',entityId:'store',entityName:'Loja',metrics:{currentRevenueCents:current,previousRevenueCents:previous,changePct:Number(change.toFixed(2))}}]
  }
  if(recipeKey==='daily_summary'){
    const from=new Date(now);from.setHours(0,0,0,0);const sales=state.sales.filter((sale:any)=>at(sale.createdAt)>=from.getTime()&&at(sale.createdAt)<=nowMs);const revenue=sales.reduce((s:number,x:any)=>s+n(x.totalCents),0),cogs=sales.reduce((s:number,x:any)=>s+n(x.cogsCents),0),items=sales.reduce((s:number,x:any)=>s+(x.items??[]).reduce((q:number,i:any)=>q+n(i.quantityMilli)/1000,0),0);return[{id:findingId(recipeKey,from.toISOString().slice(0,10)),recipeKey,severity:'info',title:'Resumo de hoje',description:`${sales.length} vendas somam ${(revenue/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}.`,entityType:'store',entityId:'store',entityName:'Loja',metrics:{salesCount:sales.length,revenueCents:revenue,cogsCents:cogs,grossProfitCents:revenue-cogs,itemsSold:Number(items.toFixed(3))}}]
  }
  return []
}

export function evaluateAllRecipes(state:PlatformInventoryState,configs:Partial<Record<AutomationRecipeKey,Record<string,unknown>>>={},now=new Date()){
  return AUTOMATION_RECIPES.map((recipe)=>({recipe,findings:evaluateRecipe(recipe.key,state,configs[recipe.key]??recipe.defaultConfig,now)}))
}
export function simulateRecipe(recipeKey:AutomationRecipeKey,state:PlatformInventoryState,config:Record<string,unknown>={},now=new Date()){
  const findings=evaluateRecipe(recipeKey,state,config,now);return{matches:findings.length,critical:findings.filter(f=>f.severity==='critical').length,warning:findings.filter(f=>f.severity==='warning').length,sample:findings.slice(0,5)}
}
