import { requireAutomationAccess, automationAccessResponse } from '@/lib/platform/auth/automationsContext'
import { automationTechnicalRpc } from '@/lib/platform/automation/technical'

function storeIdOf(request:Request){return new URL(request.url).searchParams.get('storeId')??''}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const storeId=storeIdOf(request),actor=await requireAutomationAccess(storeId,'api_keys.manage'),{id}=await params
    await automationTechnicalRpc(actor,'balcao_automation_api_key_action',{p_id:id,p_action:'revoke',p_prefix:null,p_secret_hash:null,p_approval_status:null})
    return Response.json({ok:true})
  }catch(error){return automationAccessResponse(error)}
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const storeId=storeIdOf(request),actor=await requireAutomationAccess(storeId,'api_keys.manage'),{id}=await params
    if(!actor.canApproveSensitive)return Response.json({error:{code:'AUT-KEY-APPROVAL',message:'Somente gerente ou gestão pode aprovar acessos sensíveis.'}},{status:403})
    const body=await request.json(),approval=body.approvalStatus==='rejected'?'reject':'approve'
    await automationTechnicalRpc(actor,'balcao_automation_api_key_action',{p_id:id,p_action:approval,p_prefix:null,p_secret_hash:null,p_approval_status:body.approvalStatus??null})
    return Response.json({ok:true,approvalStatus:approval==='reject'?'rejected':'approved'})
  }catch(error){return automationAccessResponse(error)}
}
