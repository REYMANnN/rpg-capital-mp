import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAsaasWebhookToken } from '@/lib/asaas/client'
import {
  disconnectMalvoForBillingFailure,
  markBillingPaid,
  markBillingPastDue,
  recordBillingPayment,
} from '@/lib/billing/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type AsaasEvent = {
  id?: unknown
  event?: unknown
  payment?: Record<string, unknown> | null
  subscription?: Record<string, unknown> | null
}

function safeEqual(received: string, expected: string) {
  const left = Buffer.from(received)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

function cents(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0
}

async function locateBillingAccount(input: { subscriptionId: string; customerId: string }) {
  const admin = createAdminClient()
  let row: Record<string, any> | null = null

  if (input.subscriptionId) {
    const { data: initial, error: initialError } = await admin.from('balcao_billing_accounts')
      .select('business_id,asaas_customer_id,asaas_initial_subscription_id,asaas_recurring_subscription_id,status,overdue_payment_id,reconnect_required')
      .eq('asaas_initial_subscription_id', input.subscriptionId)
      .maybeSingle()
    if (initialError) throw initialError
    row = initial

    if (!row) {
      const { data: recurring, error: recurringError } = await admin.from('balcao_billing_accounts')
        .select('business_id,asaas_customer_id,asaas_initial_subscription_id,asaas_recurring_subscription_id,status,overdue_payment_id,reconnect_required')
        .eq('asaas_recurring_subscription_id', input.subscriptionId)
        .maybeSingle()
      if (recurringError) throw recurringError
      row = recurring
    }
  }

  // The customer is persisted before subscriptions are created, so this also closes the
  // tiny race where a same-day card webhook arrives before subscription IDs are saved.
  if (!row && input.customerId) {
    const { data: customer, error: customerError } = await admin.from('balcao_billing_accounts')
      .select('business_id,asaas_customer_id,asaas_initial_subscription_id,asaas_recurring_subscription_id,status,overdue_payment_id,reconnect_required')
      .eq('asaas_customer_id', input.customerId)
      .maybeSingle()
    if (customerError) throw customerError
    row = customer
  }

  return row
}

async function beginEvent(eventId: string, eventType: string, resourceId: string | null) {
  const admin = createAdminClient()
  const { data: existing, error: readError } = await admin.from('balcao_billing_webhook_events')
    .select('asaas_event_id,processed_at,attempts')
    .eq('asaas_event_id', eventId)
    .maybeSingle()
  if (readError) throw readError
  if (existing?.processed_at) return { duplicate: true }

  if (existing) {
    const { error } = await admin.from('balcao_billing_webhook_events').update({
      attempts: Number(existing.attempts || 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('asaas_event_id', eventId)
    if (error) throw error
  } else {
    const { error } = await admin.from('balcao_billing_webhook_events').insert({
      asaas_event_id: eventId,
      event_type: eventType,
      resource_id: resourceId,
      attempts: 1,
    })
    if (error && error.code !== '23505') throw error
  }

  return { duplicate: false }
}

async function finishEvent(eventId: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('balcao_billing_webhook_events').update({
    processed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('asaas_event_id', eventId)
  if (error) throw error
}

export async function POST(request: Request) {
  const providedToken = request.headers.get('asaas-access-token')?.trim() || ''
  let expectedToken = ''
  try {
    expectedToken = getAsaasWebhookToken()
  } catch {
    return NextResponse.json({ error: 'Webhook não configurado.' }, { status: 503 })
  }
  if (!providedToken || !safeEqual(providedToken, expectedToken)) {
    return NextResponse.json({ error: 'Webhook não autorizado.' }, { status: 401 })
  }

  const payload = await request.json().catch(() => null) as AsaasEvent | null
  const eventId = typeof payload?.id === 'string' ? payload.id : ''
  const eventType = typeof payload?.event === 'string' ? payload.event : ''
  const payment = payload?.payment && typeof payload.payment === 'object' ? payload.payment : null
  const subscription = payload?.subscription && typeof payload.subscription === 'object' ? payload.subscription : null
  const resourceId = typeof payment?.id === 'string' ? payment.id : typeof subscription?.id === 'string' ? subscription.id : null

  if (!eventId || !eventType) return NextResponse.json({ error: 'Evento inválido.' }, { status: 400 })

  try {
    const started = await beginEvent(eventId, eventType, resourceId)
    if (started.duplicate) return NextResponse.json({ ok: true, duplicate: true })

    if (payment) {
      const paymentId = typeof payment.id === 'string' ? payment.id : ''
      const subscriptionId = typeof payment.subscription === 'string' ? payment.subscription : ''
      const customerId = typeof payment.customer === 'string' ? payment.customer : ''
      if (paymentId) {
        const account = await locateBillingAccount({ subscriptionId, customerId })
        if (account?.business_id) {
          const billingKind = subscriptionId && subscriptionId === account.asaas_initial_subscription_id
            ? 'initial'
            : subscriptionId && subscriptionId === account.asaas_recurring_subscription_id
              ? 'recurring'
              : 'unknown'
          const invoiceUrl = typeof payment.invoiceUrl === 'string'
            ? payment.invoiceUrl
            : typeof payment.bankSlipUrl === 'string'
              ? payment.bankSlipUrl
              : null
          const paymentStatus = typeof payment.status === 'string' ? payment.status : eventType
          const dueDate = typeof payment.dueDate === 'string' ? payment.dueDate : null

          await recordBillingPayment({
            businessId: account.business_id,
            paymentId,
            subscriptionId: subscriptionId || null,
            amountCents: cents(payment.value),
            dueDate,
            status: paymentStatus,
            billingKind,
            invoiceUrl,
            confirmedAt: ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(eventType) ? new Date().toISOString() : null,
          })

          if (['PAYMENT_OVERDUE', 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'].includes(eventType)) {
            await markBillingPastDue({ businessId: account.business_id, paymentId, invoiceUrl })
            await disconnectMalvoForBillingFailure(account.business_id)
          }

          if (['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(eventType)) {
            await markBillingPaid({ businessId: account.business_id, paymentId })
          }
        }
      }
    }

    if (subscription && ['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'].includes(eventType)) {
      const subscriptionId = typeof subscription.id === 'string' ? subscription.id : ''
      if (subscriptionId) {
        const account = await locateBillingAccount({ subscriptionId, customerId: '' })
        if (account?.business_id) {
          const admin = createAdminClient()
          const { error } = await admin.from('balcao_billing_accounts').update({
            status: 'cancelled',
            updated_at: new Date().toISOString(),
          }).eq('business_id', account.business_id)
          if (error) throw error
        }
      }
    }

    await finishEvent(eventId)
    return NextResponse.json({ ok: true })
  } catch (caught) {
    console.error('BALCAO Asaas webhook processing failed', {
      eventId,
      eventType,
      message: caught instanceof Error ? caught.message : 'unknown error',
    })
    // 5xx asks Asaas to retry. The event remains unprocessed and is safe to replay.
    return NextResponse.json({ error: 'Falha temporária ao processar evento.' }, { status: 500 })
  }
}
