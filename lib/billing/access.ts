import { createAdminClient } from '@/lib/supabase/admin'
import { BANK_PRICE_CENTS, isBillingBypassEmail, monthlyAmountCents } from './config'

export type BillingStatus = 'pending_setup' | 'pending_payment' | 'active' | 'past_due' | 'blocked' | 'canceled'

export type BusinessBillingState = {
  businessId: string
  bypass: boolean
  status: BillingStatus
  allowed: boolean
  pricePerBankCents: number
  currentBankCount: number
  nextBankCount: number
  currentAmountCents: number
  nextAmountCents: number
  paidUntil: string | null
  availableSlots: number
  cardBrand: string | null
  cardLast4: string | null
  cardExpiryMonth: string | null
  cardExpiryYear: string | null
  providerSyncError: string | null
}

export function hasBillingAccess(state: Pick<BusinessBillingState, 'bypass' | 'status' | 'allowed'>) {
  return state.bypass || state.allowed || state.status === 'active'
}

export async function getBusinessBillingState(businessId: string, email?: string | null): Promise<BusinessBillingState> {
  const admin = createAdminClient()
  if (isBillingBypassEmail(email)) {
    const { count } = await admin.from('balcao_finance_connections')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .neq('status', 'disconnected')
    const activeCount = count ?? 0
    return {
      businessId,
      bypass: true,
      status: 'active',
      allowed: true,
      pricePerBankCents: BANK_PRICE_CENTS,
      currentBankCount: activeCount,
      nextBankCount: activeCount,
      currentAmountCents: monthlyAmountCents(activeCount),
      nextAmountCents: monthlyAmountCents(activeCount),
      paidUntil: null,
      availableSlots: 999999,
      cardBrand: null,
      cardLast4: null,
      cardExpiryMonth: null,
      cardExpiryYear: null,
      providerSyncError: null,
    }
  }

  const [{ data: account, error: accountError }, { count: availableSlots, error: slotError }] = await Promise.all([
    admin.from('balcao_billing_accounts')
      .select('status, price_per_bank_cents, current_bank_count, next_bank_count, current_amount_cents, next_amount_cents, provider_sync_error')
      .eq('business_id', businessId)
      .maybeSingle(),
    admin.from('balcao_billing_slots')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'available')
      .eq('payment_status', 'active'),
  ])

  if (accountError) throw accountError
  if (slotError) throw slotError
  const status = (account?.status || 'pending_setup') as BillingStatus
  return {
    businessId,
    bypass: false,
    status,
    allowed: status === 'active',
    pricePerBankCents: account?.price_per_bank_cents ?? BANK_PRICE_CENTS,
    currentBankCount: account?.current_bank_count ?? 0,
    nextBankCount: account?.next_bank_count ?? 0,
    currentAmountCents: account?.current_amount_cents ?? 0,
    nextAmountCents: account?.next_amount_cents ?? 0,
    paidUntil: null,
    availableSlots: availableSlots ?? 0,
    cardBrand: null,
    cardLast4: null,
    cardExpiryMonth: null,
    cardExpiryYear: null,
    providerSyncError: account?.provider_sync_error ?? null,
  }
}

export async function reserveBillingSlot(input: { businessId: string; email?: string | null }) {
  if (isBillingBypassEmail(input.email)) return { bypass: true as const, slotId: null }
  const state = await getBusinessBillingState(input.businessId, input.email)
  if (!hasBillingAccess(state)) return { bypass: false as const, slotId: null }
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('balcao_reserve_billing_slot', { p_business_id: input.businessId })
  if (error) throw error
  return { bypass: false as const, slotId: typeof data === 'string' ? data : null }
}

export async function releaseBillingReservation(businessId: string, slotId: string | null) {
  if (!slotId) return
  const admin = createAdminClient()
  const { error } = await admin.rpc('balcao_release_billing_slot_reservation', {
    p_slot_id: slotId,
    p_business_id: businessId,
  })
  if (error) throw error
}

export async function attachReservedBillingSlot(businessId: string, financeConnectionId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('balcao_attach_reserved_billing_slot', {
    p_business_id: businessId,
    p_finance_connection_id: financeConnectionId,
  })
  if (error) throw error
  return typeof data === 'string' ? data : null
}

export async function retireBillingSlot(financeConnectionId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('balcao_retire_billing_slot', { p_finance_connection_id: financeConnectionId })
  if (error) throw error
  return typeof data === 'string' ? data : null
}

export async function createAvailableBillingSlot(input: { businessId: string; operationId: string; nextDueDate?: string | null }) {
  const admin = createAdminClient()
  const { data: existing } = await admin.from('balcao_billing_slots').select('id').eq('operation_id', input.operationId).maybeSingle()
  if (existing?.id) return existing.id as string
  const { data, error } = await admin.from('balcao_billing_slots').insert({
    business_id: input.businessId,
    operation_id: input.operationId,
    status: 'available',
    payment_status: 'active',
    paid_amount_cents: BANK_PRICE_CENTS,
    next_due_date: input.nextDueDate ?? null,
  }).select('id').single()
  if (error) throw error
  return data.id as string
}

export async function getBillingAccountRecord(businessId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.from('balcao_billing_accounts').select('*').eq('business_id', businessId).maybeSingle()
  if (error) throw error
  return data
}
