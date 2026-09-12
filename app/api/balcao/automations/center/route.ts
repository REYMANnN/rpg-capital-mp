import { automationAccessResponse,requireAutomationAccess } from '@/lib/platform/auth/automationsContext'
import { getAutomationCenter,upsertAutomation } from '@/lib/platform/automation/service'
export const dynamic='force-dynamic'
export async function GET(request:Request){try{const storeId=new URL(request.url).searchParams.get('storeId')??'';const actor=await requireAutomationAccess(storeId,'automations.view');return Response.json(await getAutomationCenter(actor),{headers:{'cache-control':'private, no-store'}})}catch(error){return automationAccessResponse(error)}}
export async function POST(request:Request){try{const body=await request.json();const actor=await requireAutomationAccess(String(body.storeId??''),'automations.manage');const automation=await upsertAutomation(actor,{recipeKey:String(body.recipeKey??''),status:body.status,mode:body.mode,config:body.config,scope:body.scope});return Response.json({automation},{status:201})}catch(error){return automationAccessResponse(error)}}
export async function PATCH(request:Request){return POST(request)}
