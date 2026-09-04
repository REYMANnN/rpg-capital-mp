import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAvailableBillingSlot } from '@/lib/billing/access'
import { BANK_PRICE_CENTS, monthlyAmountCents } from '@/lib/billing/config'
import { deleteSubscription } from '@/lib/asaas/client'
import { deleteMalvoItem } from '@/lib/malvo/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function safeEqual(value: string, expected: string) {
  const left = Buffer.from(value)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

function authorized(request: Request) {
  const secret = process.env.ASAAS_WEBHOOK_TOKEN?.trim()
  if (!secret) return false
  const provided = request.headers.get('asaas-access-token') || ''
  return safeEqual(provided, secret)
}

function dateOnly(value: unknown) {
  if (typeof value !== 'string') return null
  const match = value.match(/^\d{4}-\d{2}-\d{2}/)
  return match?.[0] ?? null
}

function addOneMonth(value: string | null) {
  if (!value) return null
  const date = new Date(`${value}T12:00:00Z`)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + 1)
  const maxDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, maxDay))
  return date.toISOString().slice(0, 10)
}

async function operationForCheckout(checkoutId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.from('balcao_billing_operations')
    .select('id, business_id, operation_type, status, provider_subscription_id, metadata')
    .contains('metadata', { checkoutId })
    .maybeSingle()
  if (error) throw error
  return data
}

async function recomputeBusinessStatus(businessId: string) {
  const admin = createAdminClient()
  const { data: slots, error } = await admin.from('balcao_billing_slots')
    .select('status, payment_status')
    .eq('business_id', businessId)
    .neq('status', 'retired')
  if (error) throw error
  const activeSlots = slots || []
  const count = activeSlots.length
  const blocked = activeSlots.some((slot) => slot.payment_status === 'blocked')
  const pastDue = activeSlots.some((slot) => slot.payment_status === 'past_due')
  const status = blocked ? 'blocked' : pastDue ? 'past_due' : 'active'
  const amount = monthlyAmountCents(count)
  const { error: updateError } = await admin.from('balcao_billing_accounts').update({
    status,
    next_bank_count: count,
    next_amount_cents: amount,
    provider_sync_error: null,
    past_due_at: pastDue ? new Date().toISOString() : null,
    blocked_at: blocked ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('business_id', businessId)
  if (updateError) throw updateError
}

async function disconnectSlotMalvo(slot: { id: string; business_id: string; finance_connection_id: string | null }) {
  if (!slot.finance_connection_id) return
  const admin = createAdminClient()
  const { data: connection } = await admin.from('balcao_finance_connections')
    .select('id, provider, provider_item_id, status')
    .eq('id', slot.finance_connection_id)
    .maybeSingle()

  if (connection?.provider === 'malvo' && connection.provider_item_id && connection.status !== 'disconnected') {
    try {
      await deleteMalvoItem(connection.provider_item_id)
    } catch (caught) {
      const remoteStatus = (caught as Error & { status?: number })?.status
      if (remoteStatus !== 404) throw caught
    }
    await admin.from('balcao_finance_connections').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('id', connection.id)
    await admin.from('balcao_finance_accounts').update({ status: 'disconnected', updated_at: new Date().toISOString() })
      .eq('business_id', slot.business_id)
      .eq('provider', 'malvo')
  }

  await admin.from('balcao_billing_slots').update({
    status: 'available',
    finance_connection_id: null,
    reserved_at: null,
    reservation_expires_at: null,
    connected_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', slot.id)
}

async function handleCheckoutPaid(checkout: Record<string, any>) {
  const checkoutId = typeof checkout.id === 'string' ? checkout.id : ''
  if (!checkoutId) return
  const operation = await operationForCheckout(checkoutId)
  if (!operation || operation.status === 'confirmed') return

  const admin = createAdminClient()
  const nextDueDate = addOneMonth(dateOnly(checkout.subscription?.nextDueDate))
  const { error: operationError } = await admin.from('balcao_billing_operations').update({
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    applied_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', operation.id)
  if (operationError) throw operationError

  const slotId = await createAvailableBillingSlot({ businessId: operation.business_id, operationId: operation.id, nextDueDate })
  if (operation.provider_subscription_id) {
    await admin.from('balcao_billing_slots').update({
      asaas_subscription_id: operation.provider_subscription_id,
      updated_at: new Date().toISOString(),
    }).eq('id', slotId)
  }

  if (operation.operation_type === 'initial_subscription') {
    const { error } = await admin.from('balcao_billing_accounts').update({
      status: 'active',
      current_bank_count: 1,
      next_bank_count: 1,
      current_amount_cents: BANK_PRICE_CENTS,
      next_amount_cents: BANK_PRICE_CENTS,
      past_due_at: null,
      blocked_at: null,
      provider_sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq('business_id', operation.business_id)
    if (error) throw error
  } else if (operation.operation_type === 'add_bank') {
    const { data: account, error: accountError } = await admin.from('balcao_billing_accounts')
      .select('current_bank_count, next_bank_count')
      .eq('business_id', operation.business_id)
      .maybeSingle()
    if (accountError) throw accountError
    const current = (account?.current_bank_count ?? 0) + 1
    const next = (account?.next_bank_count ?? 0) + 1
    const { error } = await admin.from('balcao_billing_accounts').update({
      status: 'active',
      current_bank_count: current,
      next_bank_count: next,
      current_amount_cents: monthlyAmountCents(current),
      next_amount_cents: monthlyAmountCents(next),
      past_due_at: null,
      blocked_at: null,
      provider_sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq('business_id', operation.business_id)
    if (error) throw error
  }
}

async function handleCheckoutFailed(checkout: Record<string, any>) {
  const checkoutId = typeof checkout.id === 'string' ? checkout.id : ''
  if (!checkoutId) return
  const operation = await operationForCheckout(checkoutId)
  if (!operation || operation.status === 'confirmed') return
  const admin = createAdminClient()
  await admin.from('balcao_billing_operations').update({
    status: 'failed',
    error_message: 'Checkout cancelado ou expirado antes da confirmação.',
    updated_at: new Date().toISOString(),
  }).eq('id', operation.id)
}

async function handleSubscriptionCreated(subscription: Record<string, any>) {
  const subscriptionId = typeof subscription.id === 'string' ? subscription.id : ''
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : ''
  if (!subscriptionId || !customerId) return

  const admin = createAdminClient()
  const { data: account, error: accountError } = await admin.from('balcao_billing_accounts')
    .select('business_id')
    .eq('asaas_customer_id', customerId)
    .maybeSingle()
  if (accountError) throw accountError
  if (!account?.business_id) return

  const { data: operations, error: operationError } = await admin.from('balcao_billing_operations')
    .select('id, status')
    .eq('business_id', account.business_id)
    .in('status', ['processing', 'confirmed'])
    .is('provider_subscription_id', null)
    .order('created_at', { ascending: true })
    .limit(1)
  if (operationError) throw operationError
  const operation = operations?.[0]
  if (!operation) return

  await admin.from('balcao_billing_operations').update({
    provider_subscription_id: subscriptionId,
    updated_at: new Date().toISOString(),
  }).eq('id', operation.id)

  const { data: slot } = await admin.from('balcao_billing_slots')
    .select('id, status')
    .eq('operation_id', operation.id)
    .maybeSingle()
  if (slot?.id) {
    await admin.from('balcao_billing_slots').update({
      asaas_subscription_id: subscriptionId,
      next_due_date: dateOnly(subscription.nextDueDate),
      updated_at: new Date().toISOString(),
    }).eq('id', slot.id)
    if (slot.status === 'retired') {
      await deleteSubscription(subscriptionId).catch(() => undefined)
    }
  }
}

async function handlePaymentEvent(eventType: string, payment: Record<string, any>) {
  const subscriptionId = typeof payment.subscription === 'string' ? payment.subscription : ''
  if (!subscriptionId) return
  const admin = createAdminClient()
  const { data: slot, error } = await admin.from('balcao_billing_slots')
    .select('id, business_id, finance_connection_id, status, payment_status')
    .eq('asaas_subscription_id', subscriptionId)
    .maybeSingle()
  if (error) throw error
  if (!slot || slot.status === 'retired') return

  if (eventType === 'PAYMENT_CONFIRMED' || eventType === 'PAYMENT_RECEIVED') {
    await admin.from('balcao_billing_slots').update({
      payment_status: 'active',
      next_due_date: addOneMonth(dateOnly(payment.dueDate)),
      updated_at: new Date().toISOString(),
    }).eq('id', slot.id)
    await recomputeBusinessStatus(slot.business_id)
    return
  }

  if (eventType === 'PAYMENT_OVERDUE' || eventType === 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED') {
    await admin.from('balcao_billing_slots').update({ payment_status: 'past_due', updated_at: new Date().toISOString() }).eq('id', slot.id)
    await disconnectSlotMalvo(slot)
    await recomputeBusinessStatus(slot.business_id)
    return
  }

  if (eventType === 'PAYMENT_REFUNDED' || eventType === 'PAYMENT_CHARGEBACK_REQUESTED') {
    await admin.from('balcao_billing_slots').update({ payment_status: 'blocked', updated_at: new Date().toISOString() }).eq('id', slot.id)
    await disconnectSlotMalvo(slot)
    await recomputeBusinessStatus(slot.business_id)
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await request.json().catch(() => null) as Record<string, any> | null
  if (!payload || typeof payload.id !== 'string' || typeof payload.event !== 'string') {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
  }

  const eventId = payload.id
  const eventType = payload.event
  const checkout = payload.checkout && typeof payload.checkout === 'object' ? payload.checkout as Record<string, any> : null
  const subscription = payload.subscription && typeof payload.subscription === 'object' ? payload.subscription as Record<string, any> : null
  const payment = payload.payment && typeof payload.payment === 'object' ? payload.payment as Record<string, any> : null
  const providerSubscriptionId = typeof subscription?.id === 'string' ? subscription.id : typeof payment?.subscription === 'string' ? payment.subscription : null
  const providerPaymentId = typeof payment?.id === 'string' ? payment.id : null

  const admin = createAdminClient()
  const { error: insertError } = await admin.from('balcao_billing_webhook_events').insert({
    provider: 'asaas',
    event_id: eventId,
    event_type: eventType,
    provider_payment_id: providerPaymentId,
    provider_subscription_id: providerSubscriptionId,
    payload,
  })
  if (insertError?.code === '23505') return NextResponse.json({ ok: true, duplicate: true })
  if (insertError) {
    console.error('BALCAO Asaas webhook journal failed', insertError)
    return NextResponse.json({ error: 'Webhook journal failed' }, { status: 500 })
  }

  try {
    if (eventType === 'CHECKOUT_PAID' && checkout) {
      await handleCheckoutPaid(checkout)
    } else if ((eventType === 'CHECKOUT_CANCELED' || eventType === 'CHECKOUT_EXPIRED') && checkout) {
      await handleCheckoutFailed(checkout)
    } else if (eventType === 'SUBSCRIPTION_CREATED' && subscription) {
      await handleSubscriptionCreated(subscription)
    } else if (payment && [
      'PAYMENT_CONFIRMED',
      'PAYMENT_RECEIVED',
      'PAYMENT_OVERDUE',
      'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
      'PAYMENT_REFUNDED',
      'PAYMENT_CHARGEBACK_REQUESTED',
    ].includes(eventType)) {
      await handlePaymentEvent(eventType, payment)
    }

    await admin.from('balcao_billing_webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_id', eventId)
    return NextResponse.json({ ok: true })
  } catch (caught) {
    console.error('BALCAO Asaas webhook processing failed', caught)
    await admin.from('balcao_billing_webhook_events').delete().eq('event_id', eventId)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
