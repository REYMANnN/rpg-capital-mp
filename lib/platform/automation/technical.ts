import { createInventoryCloudClient } from '@/lib/supabase/inventoryCloud'
import type { AutomationActor } from '@/lib/platform/auth/automationsContext'

export async function automationTechnicalRpc<T=unknown>(actor:AutomationActor, fn:string, args:Record<string,unknown>={}){
  const {data,error}=await createInventoryCloudClient().rpc(fn,{p_installation_id:actor.installationId,...args} as any)
  if(error) throw error
  return data as T
}

export async function automationTechnicalEntityRpc<T=unknown>(installationId:string, fn:string, args:Record<string,unknown>={}){
  const {data,error}=await createInventoryCloudClient().rpc(fn,{p_installation_id:installationId,...args} as any)
  if(error) throw error
  return data as T
}
