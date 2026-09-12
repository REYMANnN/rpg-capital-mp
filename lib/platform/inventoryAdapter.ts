import { cookies } from 'next/headers'
import { INVENTORY_INSTALLATION_COOKIE } from '@/lib/accounts/terminal'
import { INVENTORY_APP_VERSION } from '@/lib/inventory/version'
import { createInventoryCloudClient } from '@/lib/supabase/inventoryCloud'

export type PlatformInventoryState={products:any[];sales:any[];movements:any[];scaleRule?:any}
const empty=():PlatformInventoryState=>({products:[],sales:[],movements:[]})
async function installationFor(storeId:string,businessId:string,explicit?:string){
  const installationId=explicit||(await cookies()).get(INVENTORY_INSTALLATION_COOKIE)?.value||''
  if(!installationId)throw new Error('BALCAO_PLATFORM_INSTALLATION_REQUIRED')
  const cloud=createInventoryCloudClient();const{data,error}=await cloud.rpc('balcao_automation_store_context',{p_installation_id:installationId});if(error)throw error;const context=(data??{}) as any
  if(String(context.storeId??'')!==storeId||String(context.businessId??'')!==businessId)throw new Error('BALCAO_PLATFORM_STORE_FORBIDDEN')
  return installationId
}
export async function loadInventoryState(storeId:string,businessId:string,installationId?:string):Promise<PlatformInventoryState>{const resolved=await installationFor(storeId,businessId,installationId);const cloud=createInventoryCloudClient();const{data,error}=await cloud.rpc('inventory_v1_get_state',{p_installation_id:resolved});if(error)throw error;const result=data&&typeof data==='object'?data as any:{};const state=result.found&&result.state&&typeof result.state==='object'?result.state as any:empty();return{products:Array.isArray(state.products)?state.products:[],sales:Array.isArray(state.sales)?state.sales:[],movements:Array.isArray(state.movements)?state.movements:[],scaleRule:state.scaleRule}}
export async function saveInventoryState(storeId:string,businessId:string,state:PlatformInventoryState,installationId?:string){const resolved=await installationFor(storeId,businessId,installationId);const{error}=await createInventoryCloudClient().rpc('inventory_v1_sync_state',{p_installation_id:resolved,p_state:state,p_app_version:INVENTORY_APP_VERSION});if(error)throw error}
