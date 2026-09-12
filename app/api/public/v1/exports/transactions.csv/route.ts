import { requirePublicApi, publicApiError } from '@/lib/platform/auth/publicApiContext'
import { financeTransactions } from '@/lib/platform/services/financeReadService'
import { csvResponse,toCsv } from '@/lib/platform/csv'
export async function GET(request:Request){ try{ const ctx=await requirePublicApi(request,'finance:read'); const tx=await financeTransactions(ctx.storeId,ctx.businessId); return csvResponse(toCsv(['id','data','valor_centavos','descricao','contraparte','categoria','transferencia_interna','fonte'],tx.map(t=>[t.id,t.postedAt,t.amountCents,t.description,t.counterpartyName??'',t.category??'',t.isInternalTransfer,t.source])),'movimentacoes-financeiras.csv') }catch(error){ return publicApiError(error) } }
