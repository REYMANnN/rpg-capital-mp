import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { parseExplicitPixKey, pixReminder, type PixParseResult } from '@/lib/rafa-pix-core'

export type StorePixStatus = {
  businessId: string
  key: string | null
}

async function businessIdForStore(storeId: string) {
  const { data, error } = await createAdminClient().from('inventory_v1_stores')
    .select('business_id')
    .eq('id', storeId)
    .maybeSingle()
  if (error) throw error
  return data?.business_id ? String(data.business_id) : null
}

export async function pixStatusForStore(storeId: string): Promise<StorePixStatus | null> {
  const businessId = await businessIdForStore(storeId)
  if (!businessId) return null
  const { data, error } = await createAdminClient().from('balcao_businesses')
    .select('id,pix_key')
    .eq('id', businessId)
    .eq('active', true)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const key = typeof data.pix_key === 'string' && data.pix_key.trim() ? data.pix_key.trim() : null
  return { businessId: String(data.id), key }
}

export async function savePixForStore(storeId: string, key: string) {
  const status = await pixStatusForStore(storeId)
  if (!status) return { status: 'store_not_found' as const }
  if (status.key === key) return { status: 'already_saved' as const, key }
  if (status.key) return { status: 'different_key_exists' as const, key: status.key }

  const admin = createAdminClient()
  const { data, error } = await admin.from('balcao_businesses')
    .update({ pix_key: key, updated_at: new Date().toISOString() })
    .eq('id', status.businessId)
    .is('pix_key', null)
    .select('pix_key')
    .maybeSingle()
  if (error) throw error
  if (data?.pix_key === key) return { status: 'saved' as const, key }

  const latest = await pixStatusForStore(storeId)
  if (latest?.key === key) return { status: 'already_saved' as const, key }
  if (latest?.key) return { status: 'different_key_exists' as const, key: latest.key }
  return { status: 'save_failed' as const }
}

export function parsePixSubmission(text: string): PixParseResult {
  return parseExplicitPixKey(text)
}

export async function withPixReminder(storeId: string, body: string) {
  const status = await pixStatusForStore(storeId).catch(() => null)
  if (!status || status.key) return body
  const reminder = pixReminder()
  return body.includes(reminder) ? body : `${body.trim()}\n\n${reminder}`
}

export async function handlePixSubmission(storeId: string, text: string) {
  const parsed = parsePixSubmission(text)
  if (parsed.status !== 'valid') return parsed
  const saved = await savePixForStore(storeId, parsed.key)
  return { ...parsed, save: saved }
}
