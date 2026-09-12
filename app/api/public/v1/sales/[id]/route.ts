import { requirePublicApi, publicApiError } from '@/lib/platform/auth/publicApiContext'
import { getSale } from '@/lib/platform/services/salesService'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){ try{ const ctx=await requirePublicApi(request,'sales:read'); const {id}=await params; const sale=await getSale(ctx.storeId,ctx.businessId,id); if(!sale) return Response.json({error:{code:'not_found',message:'Venda não encontrada.'}},{status:404}); return Response.json({data:sale}) }catch(error){ return publicApiError(error) } }
