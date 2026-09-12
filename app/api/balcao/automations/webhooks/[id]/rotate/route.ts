import { randomBytes } from 'node:crypto'
import { requireAutomationAccess, automationAccessResponse } from '@/lib/platform/auth/automationsContext'
import { encryptWebhookSecret } from '@/lib/platform/webhooks/crypto'
import { automationTechnicalRpc } from '@/lib/platform/automation/technical'

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const storeId=new URL(request.url).searchParams.get('storeId')??'',actor=await requireAutomationAccess(storeId,'webhooks.manage'),{id}=await params
    const secret=`whsec_${randomBytes(32).toString('base64url')}`
    await automationTechnicalRpc(actor,'balcao_automation_webhook_action',{p_id:id,p_action:'rotate',p_status:null,p_secret_ciphertext:encryptWebhookSecret(secret)})
    return Response.json({id,secret})
  }catch(error){return automationAccessResponse(error)}
}
