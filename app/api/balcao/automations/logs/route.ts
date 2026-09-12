import { requireAutomationAccess, automationAccessResponse } from '@/lib/platform/auth/automationsContext'
import { automationTechnicalRpc } from '@/lib/platform/automation/technical'

export async function GET(request:Request){
  try{
    const storeId=new URL(request.url).searchParams.get('storeId')??'',actor=await requireAutomationAccess(storeId,'automations.view')
    const rows=await automationTechnicalRpc<any[]>(actor,'balcao_automation_delivery_logs',{p_store_id:storeId,p_limit:50})
    return Response.json({logs:(rows??[]).map((row:any)=>({id:row.id,endpoint_id:row.endpoint_id,endpointName:row.endpoint_name,status:row.status,attempt_count:row.attempt_count,response_status:row.response_status,duration_ms:row.duration_ms,last_error:row.last_error,created_at:row.created_at,delivered_at:row.delivered_at,balcao_event_outbox:{event_type:row.event_type,occurred_at:row.occurred_at}}))})
  }catch(error){return automationAccessResponse(error)}
}
