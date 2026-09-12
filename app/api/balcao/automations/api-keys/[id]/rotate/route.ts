import { requireAutomationAccess, automationAccessResponse } from '@/lib/platform/auth/automationsContext'
import { generateApiKey } from '@/lib/platform/auth/apiKeys'
import { automationTechnicalRpc } from '@/lib/platform/automation/technical'

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const storeId=new URL(request.url).searchParams.get('storeId')??'',actor=await requireAutomationAccess(storeId,'api_keys.manage'),{id}=await params,key=generateApiKey()
    await automationTechnicalRpc(actor,'balcao_automation_api_key_action',{p_id:id,p_action:'rotate',p_prefix:key.prefix,p_secret_hash:key.secretHash,p_approval_status:null})
    return Response.json({id,prefix:key.prefix,secret:key.token})
  }catch(error){return automationAccessResponse(error)}
}
