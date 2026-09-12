import { requirePublicApi, publicApiError } from '@/lib/platform/auth/publicApiContext'
import { getProduct } from '@/lib/platform/services/productsService'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){ try{ const ctx=await requirePublicApi(request,'products:read'); const {id}=await params; const product=await getProduct(ctx.storeId,ctx.businessId,id); if(!product) return Response.json({error:{code:'not_found',message:'Produto não encontrado.'}},{status:404}); return Response.json({data:product}) }catch(error){ return publicApiError(error) } }
