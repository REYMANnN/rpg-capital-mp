import { requireAutomationAccess, automationAccessResponse } from '@/lib/platform/auth/automationsContext'
import { automationTechnicalRpc } from '@/lib/platform/automation/technical'

function storeIdOf(request:Request){return new URL(request.url).searchParams.get('storeId')??''}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const storeId=storeIdOf(request),actor=await requireAutomationAccess(storeId,'webhooks.manage'),{id}=await params
    await automationTechnicalRpc(actor,'balcao_automation_webhook_action',{p_id:id,p_action:'delete',p_status:null,p_secret_ciphertext:null})
    return Response.json({ok:true})
  }catch(error){return automationAccessResponse(error)}
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const storeId=storeIdOf(request),actor=await requireAutomationAccess(storeId,'webhooks.manage'),{id}=await params,body=await request.json()
    const status=body.status==='paused'?'paused':'active'
    await automationTechnicalRpc(actor,'balcao_automation_webhook_action',{p_id:id,p_action:'status',p_status:status,p_secret_ciphertext:null})
    return Response.json({ok:true,status})
  }catch(error){return automationAccessResponse(error)}
}
