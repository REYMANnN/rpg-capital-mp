import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendText } from '@/lib/whatsapp'
import { couponLink, courtesyEndMessage, newCouponCode, PAYMENT_LINK } from './core'

export { COUPON_COOKIE, couponLink, normalizeCouponCode, PAYMENT_LINK, SITE_URL } from './core'
export const COURTESY_GRACE_DAYS = 7

export async function createCoupon(note: string) {
  const admin = createAdminClient()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newCouponCode()
    const { error } = await admin.from('balcao_coupons').insert({ code, note: note.slice(0, 200) })
    if (!error) return { code, link: couponLink(code) }
    if (error.code !== '23505') throw error
  }
  throw new Error('coupon_code_collision')
}

export async function deleteCoupon(code: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.from('balcao_coupons').delete().eq('code', code).eq('status', 'available').select('code')
  if (error) throw error
  return Boolean(data?.length)
}

// Encerra a cortesia: 7 dias para cadastrar o cartão e aviso no WhatsApp do dono.
export async function endCourtesy(businessId: string) {
  const admin = createAdminClient()
  const endsAt = new Date(Date.now() + COURTESY_GRACE_DAYS * 24 * 60 * 60 * 1000)
  const { data: updated, error } = await admin.from('balcao_billing_accounts')
    .update({ status: 'courtesy_ending', courtesy_end_requested_at: new Date().toISOString(), courtesy_ends_at: endsAt.toISOString(), updated_at: new Date().toISOString() })
    .eq('business_id', businessId).in('status', ['courtesy', 'courtesy_ending']).select('business_id')
  if (error) throw error
  if (!updated?.length) return { ok: false as const, error: 'not_in_courtesy' }

  const { data: business } = await admin.from('balcao_businesses').select('display_name, phone').eq('id', businessId).maybeSingle()
  const message = courtesyEndMessage(String(business?.display_name || 'sua loja'), endsAt)
  const digits = String(business?.phone || '').replace(/\D/g, '')
  const phone = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits.length >= 12 ? digits : ''
  let sent = false
  let sendError: string | null = null
  if (phone) {
    const result = await sendText(phone, message, { noMenu: true })
    sent = result.ok
    if (!result.ok) sendError = result.error
  } else {
    sendError = 'Loja sem telefone cadastrado'
  }
  await admin.from('balcao_audit_events').insert({ business_id: businessId, action: 'billing.courtesy_ending', entity_type: 'business', entity_id: businessId, metadata: { sent, ends_at: endsAt.toISOString() } })
  return { ok: true as const, sent, sendError, message, paymentLink: PAYMENT_LINK, endsAt: endsAt.toISOString() }
}

export async function reopenCourtesy(businessId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.from('balcao_billing_accounts')
    .update({ status: 'courtesy', courtesy_end_requested_at: null, courtesy_ends_at: null, updated_at: new Date().toISOString() })
    .eq('business_id', businessId).eq('status', 'courtesy_ending').select('business_id')
  if (error) throw error
  if (data?.length) await admin.from('balcao_audit_events').insert({ business_id: businessId, action: 'billing.courtesy_reopened', entity_type: 'business', entity_id: businessId, metadata: {} })
  return Boolean(data?.length)
}
