import { requirePublicApi, publicApiError } from '@/lib/platform/auth/publicApiContext'
import { inventorySummary } from '@/lib/platform/services/inventoryService'
export const dynamic='force-dynamic'
export async function GET(request:Request){ try{ const ctx=await requirePublicApi(request,'inventory:read'); return Response.json({data:await inventorySummary(ctx.storeId,ctx.businessId)},{headers:{'cache-control':'private, no-store'}}) }catch(error){ return publicApiError(error) } }
