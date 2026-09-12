import { requireAutomationAccess, automationAccessResponse } from '@/lib/platform/auth/automationsContext'
import { automationTechnicalRpc } from '@/lib/platform/automation/technical'
import { decryptWebhookSecret } from '@/lib/platform/webhooks/crypto'
import { signWebhookBody } from '@/lib/platform/webhooks/signing'

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const storeId=new URL(request.url).searchParams.get('storeId')??'',actor=await requireAutomationAccess(storeId,'webhooks.manage'),{id}=await params
    const row=await automationTechnicalRpc<any>(actor,'balcao_automation_webhook_test_context',{p_id:id})
    if(!row?.url||!row?.secretCiphertext)return Response.json({error:{code:'AUT-WEBHOOK-NOT-FOUND',message:'Webhook não encontrado.'}},{status:404})
    const eventId=crypto.randomUUID(),timestamp=Math.floor(Date.now()/1000).toString()
    const payload={id:eventId,type:'webhook.test',apiVersion:'2026-09-12',occurredAt:new Date().toISOString(),businessId:actor.businessId,storeId:actor.storeId,data:{message:'Teste do BALCÃO'}}
    const body=JSON.stringify(payload),secret=decryptWebhookSecret(String(row.secretCiphertext))
    const response=await fetch(String(row.url),{method:'POST',headers:{'content-type':'application/json','X-RPG-Event-Id':eventId,'X-RPG-Timestamp':timestamp,'X-RPG-Signature':signWebhookBody(secret,timestamp,body)},body,signal:AbortSignal.timeout(10_000)})
    return Response.json({ok:response.ok,status:response.status},{status:response.ok?200:502})
  }catch(error){return automationAccessResponse(error)}
}
