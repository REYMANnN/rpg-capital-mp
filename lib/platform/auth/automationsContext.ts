import { cookies } from 'next/headers'
import { authorizeInventoryContext } from '@/lib/accounts/requestContext'
import { INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE } from '@/lib/accounts/terminal'
import type { Permission } from '@/lib/accounts/access'
import { createInventoryCloudClient } from '@/lib/supabase/inventoryCloud'

export type AutomationActor={businessId:string;storeId:string;installationId:string;actorUserId:string|null;actorStaffId:string|null;role:string;canApproveSensitive:boolean}
export class AutomationAccessError extends Error{constructor(public status:number,message:string,public code='AUT-ACCESS-001'){super(message)}}

export async function requireAutomationAccess(storeId:string,permission:Permission):Promise<AutomationActor>{
  const jar=await cookies(),installationId=jar.get(INVENTORY_INSTALLATION_COOKIE)?.value??''
  if(!installationId)throw new AutomationAccessError(401,'Abra o BALCÃO pela sua loja para continuar.','AUT-ACCESS-002')
  const cloud=createInventoryCloudClient();const{data,error}=await cloud.rpc('balcao_automation_store_context',{p_installation_id:installationId})
  if(error)throw new AutomationAccessError(503,'Não foi possível validar sua loja agora.','AUT-ACCESS-003')
  const store=(data??{}) as any
  if(!store?.storeId||String(store.storeId)!==storeId||!store.businessId)throw new AutomationAccessError(403,'Esta sessão não tem acesso a esta loja.','AUT-ACCESS-004')
  if(process.env.BALCAO_ACCOUNTS_ENFORCED!=='true')return{businessId:String(store.businessId),storeId,installationId,actorUserId:null,actorStaffId:null,role:'manager',canApproveSensitive:true}
  const ctx=await authorizeInventoryContext({installationId,terminalCookie:jar.get(TERMINAL_COOKIE)?.value,staffCookie:jar.get(STAFF_SESSION_COOKIE)?.value})
  if(!ctx.authorized||!ctx.store||String(ctx.store.id)!==storeId)throw new AutomationAccessError(403,'Seu acesso à loja expirou.','AUT-ACCESS-005')
  if(ctx.mode==='staff'){
    if(!ctx.staff?.permissions.has(permission))throw new AutomationAccessError(403,'Seu perfil não tem acesso a esta automação.','AUT-ACCESS-006')
    return{businessId:String(store.businessId),storeId,installationId,actorUserId:null,actorStaffId:ctx.staff.staffId,role:ctx.staff.role,canApproveSensitive:ctx.staff.role==='manager'}
  }
  return{businessId:String(store.businessId),storeId,installationId,actorUserId:ctx.user?.id??null,actorStaffId:null,role:'manager',canApproveSensitive:true}
}
export function automationAccessResponse(error:unknown){if(error instanceof AutomationAccessError)return Response.json({error:{code:error.code,message:error.message}},{status:error.status});console.error('BALCAO automations failed',error);return Response.json({error:{code:'AUT-INTERNAL-001',message:'O BALCÃO encontrou um problema interno. Seus dados não foram alterados.'}},{status:500})}
