import type { User } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export type BusinessRole = 'owner' | 'admin' | 'manager'

export type ManagementStore = {
  id: string
  businessId: string
  displayName: string
  businessType: string | null
  city: string | null
  state: string | null
}

export type ManagementBusiness = {
  id: string
  displayName: string
  role: BusinessRole
  stores: ManagementStore[]
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user ?? null
}

export async function getAccountState(userId: string): Promise<{ onboarded: boolean; hasBusiness: boolean }> {
  const supabase = await createServerClient()
  const [{ data: profile, error: profileError }, { data: member, error: memberError }] = await Promise.all([
    supabase.from('balcao_profiles').select('onboarding_completed').eq('user_id', userId).maybeSingle(),
    supabase.from('balcao_business_members').select('business_id').eq('user_id', userId).eq('active', true).limit(1).maybeSingle(),
  ])
  if (profileError) throw profileError
  if (memberError) throw memberError
  return { onboarded: profile?.onboarding_completed === true, hasBusiness: Boolean(member?.business_id) }
}

export async function getBusinessRole(userId: string, businessId: string): Promise<BusinessRole | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('balcao_business_members').select('role').eq('business_id', businessId).eq('user_id', userId).eq('active', true).maybeSingle()
  if (error) throw error
  return (data?.role as BusinessRole | undefined) ?? null
}

export async function getManagementContext(userId: string): Promise<ManagementBusiness[]> {
  const supabase = await createServerClient()
  const { data: members, error: memberError } = await supabase.from('balcao_business_members').select('business_id, role').eq('user_id', userId).eq('active', true)
  if (memberError) throw memberError
  if (!members?.length) return []

  const ids = members.map((m) => m.business_id)
  const [{ data: businesses, error: businessError }, { data: stores, error: storeError }] = await Promise.all([
    supabase.from('balcao_businesses').select('id, display_name').in('id', ids).eq('active', true),
    supabase.from('inventory_v1_stores').select('id, business_id, display_name, business_type, city, state').in('business_id', ids).eq('active', true),
  ])
  if (businessError) throw businessError
  if (storeError) throw storeError

  return (businesses ?? []).map((business) => ({
    id: business.id,
    displayName: business.display_name,
    role: (members.find((m) => m.business_id === business.id)?.role ?? 'manager') as BusinessRole,
    stores: (stores ?? []).filter((store) => store.business_id === business.id).map((store) => ({
      id: store.id,
      businessId: business.id,
      displayName: store.display_name,
      businessType: store.business_type,
      city: store.city,
      state: store.state,
    })),
  }))
}

export async function getStoreBusiness(storeId: string): Promise<{ businessId: string; displayName: string; installationId: string } | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('inventory_v1_stores').select('business_id, display_name, installation_id').eq('id', storeId).eq('active', true).maybeSingle()
  if (error) throw error
  if (!data?.business_id || !data.installation_id) return null
  return { businessId: data.business_id, displayName: data.display_name, installationId: data.installation_id }
}
