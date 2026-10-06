import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { validateTrialInput } from './trial-accounts-core'

export type TrialAccount = {
  businessId: string
  storeId: string | null
  contactName: string
  businessName: string
  phone: string
  pixKey: string | null
  active: boolean
  createdAt: string
  rafaLinked: boolean
  productCount: number
  lastInteractionAt: string | null
}

export type TrialMutationError =
  | 'missing_contact_name'
  | 'missing_business_name'
  | 'invalid_phone'
  | 'phone_already_linked'
  | 'trial_not_found'
  | 'save_failed'

function mutationError(error: unknown): TrialMutationError {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message || '')
  if (message.includes('missing_contact_name')) return 'missing_contact_name'
  if (message.includes('missing_business_name')) return 'missing_business_name'
  if (message.includes('invalid_phone')) return 'invalid_phone'
  if (message.includes('phone_already_linked') || message.includes('duplicate key')) return 'phone_already_linked'
  if (message.includes('trial_not_found') || message.includes('trial_store_not_found')) return 'trial_not_found'
  return 'save_failed'
}

function rpcRow(data: unknown) {
  const first = Array.isArray(data) ? data[0] : data
  if (!first || typeof first !== 'object') return null
  const row = first as Record<string, unknown>
  if (!row.business_id || !row.store_id || !row.phone) return null
  return {
    businessId: String(row.business_id),
    storeId: String(row.store_id),
    phone: String(row.phone),
  }
}

export async function createTrialAccount(input: { contactName?: unknown; businessName?: unknown; phone?: unknown }) {
  const validated = validateTrialInput(input)
  if (!validated.ok) return validated
  const { data, error } = await createAdminClient().rpc('admin_create_trial_account', {
    p_contact_name: validated.value.contactName,
    p_business_name: validated.value.businessName,
    p_phone: validated.value.phone,
  })
  if (error) return { ok: false as const, error: mutationError(error) }
  const account = rpcRow(data)
  return account ? { ok: true as const, account } : { ok: false as const, error: 'save_failed' as const }
}

export async function updateTrialAccount(businessId: string, input: { contactName?: unknown; businessName?: unknown; phone?: unknown }) {
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) return { ok: false as const, error: 'trial_not_found' as const }
  const validated = validateTrialInput(input)
  if (!validated.ok) return validated
  const { data, error } = await createAdminClient().rpc('admin_update_trial_account', {
    p_business_id: businessId,
    p_contact_name: validated.value.contactName,
    p_business_name: validated.value.businessName,
    p_phone: validated.value.phone,
  })
  if (error) return { ok: false as const, error: mutationError(error) }
  const account = rpcRow(data)
  return account ? { ok: true as const, account } : { ok: false as const, error: 'save_failed' as const }
}

export async function deactivateTrialAccount(businessId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) return { ok: false as const, error: 'trial_not_found' as const }
  const { data, error } = await createAdminClient().rpc('admin_deactivate_trial_account', { p_business_id: businessId })
  if (error) return { ok: false as const, error: mutationError(error) }
  return data === true ? { ok: true as const } : { ok: false as const, error: 'save_failed' as const }
}

export async function listTrialAccounts(): Promise<TrialAccount[]> {
  const admin = createAdminClient()
  const { data: businesses, error } = await admin.from('balcao_businesses')
    .select('id,display_name,phone,pix_key,active,created_at,primary_contact_name')
    .eq('account_origin', 'admin_trial')
    .order('created_at', { ascending: false })
  if (error) throw error
  if (!businesses?.length) return []

  const businessIds = businesses.map((row) => String(row.id))
  const { data: stores } = await admin.from('inventory_v1_stores')
    .select('id,business_id,installation_id,active,created_at')
    .in('business_id', businessIds)
    .order('created_at', { ascending: true })
  const storeByBusiness = new Map<string, { id: string; installationId: string }>()
  for (const row of stores || []) {
    const businessId = String(row.business_id || '')
    if (!businessId || storeByBusiness.has(businessId)) continue
    storeByBusiness.set(businessId, { id: String(row.id), installationId: String(row.installation_id || '') })
  }

  const storeIds = [...storeByBusiness.values()].map((row) => row.id)
  const bindings = storeIds.length
    ? (await admin.from('wa_store_bindings').select('store_id').in('store_id', storeIds)).data || []
    : []
  const linkedStores = new Set(bindings.map((row) => String(row.store_id)))

  const phones = [...new Set(businesses.map((row) => String(row.phone || '')).filter(Boolean))]
  const inbound = phones.length
    ? (await admin.from('whatsapp_inbound_messages').select('from_phone,received_at').in('from_phone', phones).order('received_at', { ascending: false }).limit(5000)).data || []
    : []
  const lastInbound = new Map<string, string>()
  for (const row of inbound) {
    const phone = String(row.from_phone || '')
    if (phone && !lastInbound.has(phone)) lastInbound.set(phone, String(row.received_at || ''))
  }

  const productCountByStore = new Map<string, number>()
  await Promise.all([...storeByBusiness.values()].map(async ({ id, installationId }) => {
    if (!installationId) { productCountByStore.set(id, 0); return }
    const { data } = await admin.rpc('inventory_v1_get_state', { p_installation_id: installationId })
    const record = data && typeof data === 'object' ? data as Record<string, unknown> : null
    const state = record?.state && typeof record.state === 'object' ? record.state as Record<string, unknown> : null
    const products = Array.isArray(state?.products) ? state.products : []
    const activeProducts = products.filter((product) => !((product as Record<string, unknown> | null)?.deletedAt))
    productCountByStore.set(id, activeProducts.length)
  }))

  return businesses.map((row) => {
    const businessId = String(row.id)
    const store = storeByBusiness.get(businessId)
    const phone = String(row.phone || '')
    return {
      businessId,
      storeId: store?.id || null,
      contactName: String(row.primary_contact_name || ''),
      businessName: String(row.display_name || 'Loja'),
      phone,
      pixKey: row.pix_key ? String(row.pix_key) : null,
      active: row.active !== false,
      createdAt: String(row.created_at),
      rafaLinked: Boolean(store?.id && linkedStores.has(store.id)),
      productCount: store?.id ? productCountByStore.get(store.id) || 0 : 0,
      lastInteractionAt: lastInbound.get(phone) || null,
    }
  })
}
