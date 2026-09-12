import { requirePublicApi, publicApiError } from '@/lib/platform/auth/publicApiContext'
import { listSales } from '@/lib/platform/services/salesService'
import { csvResponse,toCsv } from '@/lib/platform/csv'
export async function GET(request:Request){try{const ctx=await requirePublicApi(request,'sales:read','export');const sales=await listSales(ctx.storeId,ctx.businessId);return csvResponse(toCsv(['venda_id','data','total_centavos','cmv_centavos','lucro_bruto_centavos','pagamento'],sales.map(s=>[s.id,s.createdAt,s.totalCents,s.cogsCents,s.grossProfitCents,s.payment?.method??''])),'vendas.csv')}catch(error){return publicApiError(error)}}
