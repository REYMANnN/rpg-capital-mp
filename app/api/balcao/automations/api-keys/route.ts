import { requireAutomationAccess, automationAccessResponse } from '@/lib/platform/auth/automationsContext'
import { generateApiKey, isSensitiveScope, normalizeScopes } from '@/lib/platform/auth/apiKeys'
import { automationTechnicalRpc } from '@/lib/platform/automation/technical'
export const dynamic='force-dynamic'

export async function GET(request:Request){
  try{
    const storeId=new URL(request.url).searchParams.get('storeId')??''
    const actor=await requireAutomationAccess(storeId,'api_keys.manage')
    const rows=await automationTechnicalRpc<any[]>(actor,'balcao_automation_api_keys_state',{p_store_id:storeId})
    return Response.json({keys:(rows??[]).map((row:any)=>({id:row.id,name:row.name,prefix:row.prefix,scopes:row.scopes??[],status:row.status,approvalStatus:row.approval_status,expiresAt:row.expires_at,lastUsedAt:row.last_used_at,createdAt:row.created_at}))})
  }catch(error){return automationAccessResponse(error)}
}

export async function POST(request:Request){
  try{
    const body=await request.json(),storeId=String(body.storeId??'')
    const actor=await requireAutomationAccess(storeId,'api_keys.manage')
    const scopes=normalizeScopes(body.scopes)
    if(!String(body.name??'').trim()||!scopes.length)return Response.json({error:{code:'AUT-KEY-VALIDATION',message:'Informe nome e pelo menos uma permissão.'}},{status:400})
    const key=generateApiKey(),pending=scopes.some(isSensitiveScope)&&!actor.canApproveSensitive
    const data=await automationTechnicalRpc<any>(actor,'balcao_automation_api_key_create',{p_store_id:storeId,p_name:String(body.name).trim().slice(0,120),p_prefix:key.prefix,p_secret_hash:key.secretHash,p_scopes:scopes,p_approval_status:pending?'pending':'approved',p_expires_at:body.expiresAt||null})
    return Response.json({id:data?.id,prefix:key.prefix,secret:key.token,approvalStatus:pending?'pending':'approved'},{status:201})
  }catch(error){return automationAccessResponse(error)}
}
