import { requirePublicApi, publicApiError } from '@/lib/platform/auth/publicApiContext'
import { pricingRecommendations } from '@/lib/platform/services/pricingService'
import { paginate } from '@/lib/platform/contracts/http'
export const dynamic='force-dynamic'
export async function GET(request:Request){ try{ const ctx=await requirePublicApi(request,'pricing:read'); return Response.json(paginate(await pricingRecommendations(ctx.storeId,ctx.businessId),new URL(request.url)),{headers:{'cache-control':'private, no-store'}}) }catch(error){ return publicApiError(error) } }
