import { requireAutomationAccess, automationAccessResponse } from '@/lib/platform/auth/automationsContext'
import { normalizeAuthority } from '@/lib/platform/integrations/authority'
import { automationTechnicalRpc } from '@/lib/platform/automation/technical'
export const dynamic='force-dynamic'

export async function GET(request:Request){
  try{
    const storeId=new URL(request.url).searchParams.get('storeId')??'',actor=await requireAutomationAccess(storeId,'integrations.view')
    const rows=await automationTechnicalRpc<any[]>(actor,'balcao_automation_integrations_state',{p_store_id:storeId})
    return Response.json({integrations:rows??[]})
  }catch(error){return automationAccessResponse(error)}
}

export async function POST(request:Request){
  try{
    const body=await request.json(),storeId=String(body.storeId??''),actor=await requireAutomationAccess(storeId,'integrations.manage')
    const name=String(body.name??'').trim(),kind=['erp','pos','ecommerce','bi','custom'].includes(body.kind)?body.kind:'custom'
    if(name.length<2)return Response.json({error:{code:'AUT-INTEGRATION-VALIDATION',message:'Informe um nome para a integração.'}},{status:400})
    const authority=normalizeAuthority(body.authority),direction=body.direction==='inbound'||body.direction==='outbound'?body.direction:'bidirectional'
    const data=await automationTechnicalRpc<any>(actor,'balcao_automation_integration_create',{p_store_id:storeId,p_name:name,p_kind:kind,p_direction:direction,p_authority:authority})
    return Response.json({id:data?.id,authority:data?.authority??authority},{status:201})
  }catch(error){return automationAccessResponse(error)}
}
