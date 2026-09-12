import { automationAccessResponse,requireAutomationAccess } from '@/lib/platform/auth/automationsContext'
import { runAutomation } from '@/lib/platform/automation/service'
export const dynamic='force-dynamic'
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{const body=await request.json();const actor=await requireAutomationAccess(String(body.storeId??''),'automations.manage');const{id}=await params;return Response.json(await runAutomation(actor,id))}catch(error){return automationAccessResponse(error)}}
