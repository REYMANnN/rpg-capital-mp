import { requirePublicApi, publicApiError } from '@/lib/platform/auth/publicApiContext'
import { listMovements } from '@/lib/platform/services/inventoryService'
import { paginate } from '@/lib/platform/contracts/http'
export const dynamic='force-dynamic'
export async function GET(request:Request){ try{ const ctx=await requirePublicApi(request,'inventory:read'); return Response.json(paginate(await listMovements(ctx.storeId,ctx.businessId),new URL(request.url)),{headers:{'cache-control':'private, no-store'}}) }catch(error){ return publicApiError(error) } }
