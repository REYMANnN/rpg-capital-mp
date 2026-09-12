import { requirePublicApi, publicApiError } from '@/lib/platform/auth/publicApiContext'
import { inventorySummary } from '@/lib/platform/services/inventoryService'
import { csvResponse,toCsv } from '@/lib/platform/csv'
export async function GET(request:Request){ try{ const ctx=await requirePublicApi(request,'inventory:read'); const data=await inventorySummary(ctx.storeId,ctx.businessId); return csvResponse(toCsv(['produto_id','estoque_mili','estoque_minimo_mili','custo_medio_centavos','valor_estoque_custo_centavos','valor_estoque_venda_centavos'],data.products.map((p:any)=>[p.productId,p.stockMilli,p.minStockMilli,p.averageCostCents,p.inventoryCostCents,p.inventorySaleValueCents])),'estoque.csv') }catch(error){ return publicApiError(error) } }
