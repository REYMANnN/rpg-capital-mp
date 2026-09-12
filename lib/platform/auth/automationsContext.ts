import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/accounts/currentUser'
import { authorizeInventoryContext } from '@/lib/accounts/requestContext'
import { INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE } from '@/lib/accounts/terminal'
import type { Permission } from '@/lib/accounts/access'

export type AutomationActor = { businessId:string; storeId:string; actorUserId:string|null; actorStaffId:string|null; role:string; canApproveSensitive:boolean }
export class AutomationAccessError extends Error { constructor(public status:number, message:string){ super(message) } }

export async function requireAutomationAccess(storeId:string, permission:Permission):Promise<AutomationActor>{
  const admin=createAdminClient(); const {data:store}=await admin.from('inventory_v1_stores').select('id,business_id,active').eq('id',storeId).maybeSingle(); if(!store?.active||!store.business_id) throw new AutomationAccessError(404,'Loja não encontrada.')
  const user=await getCurrentUser()
  if(user){ const {data:member}=await admin.from('balcao_business_members').select('role,active').eq('business_id',store.business_id).eq('user_id',user.id).maybeSingle(); if(member?.active&&['owner','admin','manager'].includes(String(member.role))) return {businessId:String(store.business_id),storeId,actorUserId:user.id,actorStaffId:null,role:String(member.role),canApproveSensitive:true} }
  const jar=await cookies(); const ctx=await authorizeInventoryContext({installationId:jar.get(INVENTORY_INSTALLATION_COOKIE)?.value,terminalCookie:jar.get(TERMINAL_COOKIE)?.value,staffCookie:jar.get(STAFF_SESSION_COOKIE)?.value}); if(!ctx.authorized||ctx.mode!=='staff'||!ctx.store||String(ctx.store.id)!==storeId||!ctx.staff?.permissions.has(permission)) throw new AutomationAccessError(403,'Seu perfil não tem acesso a esta automação.')
  return {businessId:String(store.business_id),storeId,actorUserId:null,actorStaffId:ctx.staff.staffId,role:ctx.staff.role,canApproveSensitive:ctx.staff.role==='manager'}
}
export function automationAccessResponse(error:unknown){ if(error instanceof AutomationAccessError) return Response.json({error:error.message},{status:error.status}); console.error('BALCAO automations access failed',error); return Response.json({error:'Não conseguimos concluir esta ação.'},{status:500}) }
