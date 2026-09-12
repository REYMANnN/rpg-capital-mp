import { randomBytes } from 'node:crypto'
import { requireAutomationAccess, automationAccessResponse } from '@/lib/platform/auth/automationsContext'
import { WEBHOOK_EVENT_SET } from '@/lib/platform/events/eventTypes'
import { encryptWebhookSecret } from '@/lib/platform/webhooks/crypto'
import { validateWebhookUrl } from '@/lib/platform/webhooks/delivery'
import { automationTechnicalRpc } from '@/lib/platform/automation/technical'
export const dynamic='force-dynamic'

export async function GET(request:Request){
  try{
    const storeId=new URL(request.url).searchParams.get('storeId')??'',actor=await requireAutomationAccess(storeId,'webhooks.manage')
    const rows=await automationTechnicalRpc<any[]>(actor,'balcao_automation_webhooks_state',{p_store_id:storeId})
    return Response.json({webhooks:rows??[]})
  }catch(error){return automationAccessResponse(error)}
}

export async function POST(request:Request){
  try{
    const body=await request.json(),storeId=String(body.storeId??''),actor=await requireAutomationAccess(storeId,'webhooks.manage')
    const name=String(body.name??'').trim(),url=String(body.url??'').trim()
    const events=Array.isArray(body.eventTypes)?[...new Set(body.eventTypes.filter((event:unknown)=>typeof event==='string'&&WEBHOOK_EVENT_SET.has(event as any)))]:[]
    if(name.length<2||!validateWebhookUrl(url)||!events.length)return Response.json({error:{code:'AUT-WEBHOOK-VALIDATION',message:'Informe nome, URL HTTPS pública e pelo menos um evento válido.'}},{status:400})
    const secret=`whsec_${randomBytes(32).toString('base64url')}`
    const id=await automationTechnicalRpc<string>(actor,'balcao_automation_webhook_create',{p_store_id:storeId,p_name:name,p_url:url,p_event_types:events,p_secret_ciphertext:encryptWebhookSecret(secret)})
    return Response.json({id,secret},{status:201})
  }catch(error){return automationAccessResponse(error)}
}
