import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { newCouponCode, normalizeCouponCode } from '@/lib/admin/core'
import { inviteLink, normalizeInvitePhone, paidUntilDate } from '@/lib/admin/invite-core'

export async function createInvite(input: { inviteeName: string; inviteePhone?: string; storeNameHint?: string }) {
  const inviteeName = input.inviteeName.trim().slice(0, 120)
  if (!inviteeName) throw new Error('invitee_name_required')
  const inviteePhone = normalizeInvitePhone(input.inviteePhone || '')
  const storeNameHint = String(input.storeNameHint || '').trim().slice(0, 160)
  const admin = createAdminClient()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newCouponCode()
    const { error } = await admin.from('balcao_coupons').insert({
      code,
      note: inviteeName,
      invitee_name: inviteeName,
      invitee_phone: inviteePhone || null,
      store_name_hint: storeNameHint || null,
    })
    if (!error) return { code, link: inviteLink(code), inviteeName, inviteePhone: inviteePhone || null, storeNameHint: storeNameHint || null }
    if (error.code !== '23505') throw error
  }
  throw new Error('invite_code_collision')
}

export async function revokeInvite(rawCode: string) {
  const code = normalizeCouponCode(rawCode)
  if (!code) return false
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin.from('balcao_coupons')
    .update({ status: 'cancelled', revoked_at: now, updated_at: now })
    .eq('code', code)
    .eq('status', 'available')
    .is('redeemed_at', null)
    .select('code')
  if (error) throw error
  return Boolean(data?.length)
}

export async function readAdminCommercialSettings() {
  const { data } = await createAdminClient().from('rpg_admin_settings').select('key,value').in('key', ['pix_key', 'plan_price_cents'])
  const map = new Map((data || []).map((row) => [String(row.key), String(row.value)]))
  const price = Number(map.get('plan_price_cents') || 999)
  return {
    pixKey: map.get('pix_key') || '',
    planPriceCents: Number.isInteger(price) && price > 0 ? price : 999,
  }
}

export async function saveAdminCommercialSettings(input: { pixKey: string; planPriceCents: number }) {
  const pixKey = input.pixKey.trim().slice(0, 240)
  const planPriceCents = Math.round(Number(input.planPriceCents))
  if (!(planPriceCents > 0 && planPriceCents < 10_000_000)) throw new Error('invalid_price')
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await admin.from('rpg_admin_settings').upsert([
    { key: 'pix_key', value: pixKey, updated_at: now },
    { key: 'plan_price_cents', value: String(planPriceCents), updated_at: now },
  ], { onConflict: 'key' })
  if (error) throw error
  return { pixKey, planPriceCents }
}

export async function markPixPaid(input: { businessId: string; amountCents?: number; note?: string }) {
  const settings = await readAdminCommercialSettings()
  const amountCents = Math.round(Number(input.amountCents || settings.planPriceCents))
  const paidAt = new Date()
  const paidUntil = paidUntilDate(paidAt)
  const { data, error } = await createAdminClient().from('rpg_pix_payments').insert({
    business_id: input.businessId,
    amount_cents: amountCents,
    paid_at: paidAt.toISOString(),
    paid_until: paidUntil,
    note: String(input.note || '').trim().slice(0, 300) || null,
  }).select('id,paid_at,paid_until,amount_cents').single()
  if (error) throw error
  return data
}
