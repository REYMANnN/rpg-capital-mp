import { createAdminClient } from '@/lib/supabase/admin'
import { INVENTORY_APP_VERSION } from '@/lib/inventory/version'

export type PlatformInventoryState = { products: any[]; sales: any[]; movements: any[]; scaleRule?: any }
const empty = (): PlatformInventoryState => ({ products: [], sales: [], movements: [] })
export async function loadInventoryState(storeId: string, businessId: string): Promise<PlatformInventoryState> {
  const admin = createAdminClient()
  const { data: store, error: storeError } = await admin.from('inventory_v1_stores').select('id,business_id,installation_id,active').eq('id', storeId).maybeSingle()
  if (storeError || !store?.active || String(store.business_id) !== businessId || !store.installation_id) throw new Error('BALCAO_PLATFORM_STORE_FORBIDDEN')
  const { data, error } = await admin.rpc('inventory_v1_get_state', { p_installation_id: store.installation_id })
  if (error) throw error
  const result = data && typeof data === 'object' ? data as any : {}
  const state = result.found && result.state && typeof result.state === 'object' ? result.state as any : empty()
  return { products: Array.isArray(state.products) ? state.products : [], sales: Array.isArray(state.sales) ? state.sales : [], movements: Array.isArray(state.movements) ? state.movements : [], scaleRule: state.scaleRule }
}
export async function saveInventoryState(storeId: string, businessId: string, state: PlatformInventoryState) {
  const admin = createAdminClient()
  const { data: store } = await admin.from('inventory_v1_stores').select('business_id,installation_id,active').eq('id', storeId).maybeSingle()
  if (!store?.active || String(store.business_id) !== businessId || !store.installation_id) throw new Error('BALCAO_PLATFORM_STORE_FORBIDDEN')
  const { error } = await admin.rpc('inventory_v1_sync_state', { p_installation_id: store.installation_id, p_state: state, p_app_version: INVENTORY_APP_VERSION })
  if (error) throw error
}
