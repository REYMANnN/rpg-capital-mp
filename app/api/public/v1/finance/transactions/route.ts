import { requirePublicApi, publicApiError } from '@/lib/platform/auth/publicApiContext'
import { financeTransactions } from '@/lib/platform/services/financeReadService'
import { paginate } from '@/lib/platform/contracts/http'
export const dynamic='force-dynamic'
export async function GET(request:Request){ try{ const ctx=await requirePublicApi(request,'finance:read'); return Response.json(paginate(await financeTransactions(ctx.storeId,ctx.businessId),new URL(request.url)),{headers:{'cache-control':'private, no-store'}}) }catch(error){ return publicApiError(error) } }
