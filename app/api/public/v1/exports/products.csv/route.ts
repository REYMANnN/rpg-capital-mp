import { requirePublicApi, publicApiError } from '@/lib/platform/auth/publicApiContext'
import { listProducts } from '@/lib/platform/services/productsService'
import { csvResponse,toCsv } from '@/lib/platform/csv'
export async function GET(request:Request){try{const ctx=await requirePublicApi(request,'products:read','export');const rows=(await listProducts(ctx.storeId,ctx.businessId)).map(p=>[p.id,p.barcode,p.name,p.brand??'',p.priceCents,p.averageCostCents,p.stockMilli,p.minStockMilli,p.active]);return csvResponse(toCsv(['id','ean','nome','marca','preco_centavos','custo_medio_centavos','estoque_mili','estoque_minimo_mili','ativo'],rows),'produtos.csv')}catch(error){return publicApiError(error)}}
