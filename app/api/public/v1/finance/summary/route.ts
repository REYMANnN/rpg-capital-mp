import { requirePublicApi, publicApiError } from '@/lib/platform/auth/publicApiContext'
import { financeSummary } from '@/lib/platform/services/financeReadService'
export const dynamic='force-dynamic'
export async function GET(request:Request){ try{ const ctx=await requirePublicApi(request,'finance:read'); const requested=Number(new URL(request.url).searchParams.get('days')??30); const days=(requested===7||requested===90?requested:30) as 7|30|90; return Response.json({data:await financeSummary(ctx.storeId,ctx.businessId,days)},{headers:{'cache-control':'private, no-store'}}) }catch(error){ return publicApiError(error) } }
