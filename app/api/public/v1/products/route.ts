import { requirePublicApi, publicApiError } from '@/lib/platform/auth/publicApiContext'
import { listProducts } from '@/lib/platform/services/productsService'
import { paginate } from '@/lib/platform/contracts/http'
export const dynamic='force-dynamic'
export async function GET(request:Request){ try{ const ctx=await requirePublicApi(request,'products:read'); const products=await listProducts(ctx.storeId,ctx.businessId); return Response.json(paginate(products,new URL(request.url)),{headers:{'cache-control':'private, no-store'}}) }catch(error){ return publicApiError(error) } }
