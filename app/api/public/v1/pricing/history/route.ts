import { requirePublicApi, publicApiError } from '@/lib/platform/auth/publicApiContext'
import { pricingHistory } from '@/lib/platform/services/pricingService'
export const dynamic='force-dynamic'
export async function GET(request:Request){ try{ await requirePublicApi(request,'pricing:read'); return Response.json({data:await pricingHistory()},{headers:{'cache-control':'private, no-store'}}) }catch(error){ return publicApiError(error) } }
