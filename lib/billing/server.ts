import { createAdminClient } from '@/lib/supabase/admin'
import { billingAllowsAccess, type BillingStatus } from './policy'
import { deleteMalvoItem } from '@/lib/malvo/client'

type AdminClient = ReturnType<typeof createAdminClient>

export type BusinessBillingState = {
  present: boolean
  status: BillingStatus | null
  allowed: boolean
  invoiceUrl: string | null
  overduePaymentId: string | null
  reconnectRequired: boolean
  nextDueDate: string | null
  accessUntil: string | null
}

function todayInBrazil(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function rowAllowsAccess(row: { status: BillingStatus; access_until?: string | null }, today = todayInBrazil()) {
  if (billingAllowsAccess(row.status)) return true
  return row.status === 'cancelled' && Boolean(row.access_until && row.access_until >= today)
}

export async function getBusinessBillingState(businessId: string, client?: AdminClient): Promise<BusinessBillingState> {
  const db = client ?? createAdminClient()
  const { data, error } = await db.from('balcao_billing_accounts')
    .select('status,overdue_invoice_url,overdue_payment_id,reconnect_required,next_due_date,access_until')
    .eq('business_id', businessId)
    .maybeSingle()

  if (error) throw error

  // Existing accounts created before Asaas billing remain accessible until they are migrated explicitly.
  if (!data) {
    return {
      present: false,
      status: null,
      allowed: true,
      invoiceUrl: null,
      overduePaymentId: null,
      reconnectRequired: false,
      nextDueDate: null,
      accessUntil: null,
    }
  }

  const status = data.status as BillingStatus
  return {
    present: true,
    status,
    allowed: rowAllowsAccess({ status, access_until: data.access_until }),
    invoiceUrl: data.overdue_invoice_url ?? null,
    overduePaymentId: data.overdue_payment_id ?? null,
    reconnectRequired: data.reconnect_required === true,
    nextDueDate: data.next_due_date ?? null,
    accessUntil: data.access_until ?? null,
  }
}

export async function billingAllowsBusinessAccess(businessId: string, client?: AdminClient) {
  return (await getBusinessBillingState(businessId, client)).allowed
}

export async function disconnectMalvoForBillingFailure(businessId: string) {
  const admin = createAdminClient()
  const { data: connections, error } = await admin.from('balcao_finance_connections')
    .select('id,store_id,provider_item_id,status')
    .eq('business_id', businessId)
    .eq('provider', 'malvo')
    .neq('status', 'disconnected')

  if (error) throw error

  for (const connection of connections ?? []) {
    try {
      await deleteMalvoItem(connection.provider_item_id)
    } catch (caught) {
      const status = (caught as Error & { status?: number })?.status
      // Already absent at Malvo is equivalent to disconnected for cost control.
      if (status !== 404) throw caught
    }

    const now = new Date().toISOString()
    const { error: connectionError } = await admin.from('balcao_finance_connections')
      .update({
        status: 'disconnected',
        execution_status: 'billing_blocked',
        last_error_code: 'billing_past_due',
        last_error_message: 'Conexão removida automaticamente por pagamento pendente do BALCÃO.',
        updated_at: now,
      })
      .eq('id', connection.id)
    if (connectionError) throw connectionError

    const { error: accountError } = await admin.from('balcao_finance_accounts')
      .update({ status: 'disconnected', updated_at: now })
      .eq('business_id', businessId)
      .eq('store_id', connection.store_id)
      .eq('provider', 'malvo')
    if (accountError) throw accountError
  }

  const { error: billingError } = await admin.from('balcao_billing_accounts')
    .update({ status: 'past_due', reconnect_required: true, updated_at: new Date().toISOString() })
    .eq('business_id', businessId)
  if (billingError) throw billingError
}

export async function markBillingPastDue(input: {
  businessId: string
  paymentId: string
  invoiceUrl?: string | null
}) {
  const admin = createAdminClient()
  const { error } = await admin.from('balcao_billing_accounts')
    .update({
      status: 'past_due',
      overdue_payment_id: input.paymentId,
      overdue_invoice_url: input.invoiceUrl ?? null,
      reconnect_required: true,
      updated_at: new Date().toISOString(),
    })
    .eq('business_id', input.businessId)
  if (error) throw error
}

export async function markBillingPaid(input: {
  businessId: string
  paymentId: string
  nextDueDate?: string | null
}) {
  const admin = createAdminClient()
  const { data: current, error: currentError } = await admin.from('balcao_billing_accounts')
    .select('status,overdue_payment_id,reconnect_required')
    .eq('business_id', input.businessId)
    .maybeSingle()
  if (currentError) throw currentError
  if (!current) return

  // If a different charge is still the known overdue charge, do not unlock on an unrelated payment.
  if (current.status === 'past_due' && current.overdue_payment_id && current.overdue_payment_id !== input.paymentId) return

  const { error } = await admin.from('balcao_billing_accounts')
    .update({
      status: 'active',
      overdue_payment_id: null,
      overdue_invoice_url: null,
      next_due_date: input.nextDueDate ?? undefined,
      // Payment restores BALCÃO access. Open Finance stays disconnected until the user authorizes it again.
      reconnect_required: true,
      updated_at: new Date().toISOString(),
    })
    .eq('business_id', input.businessId)
  if (error) throw error
}

export async function recordBillingPayment(input: {
  businessId: string
  paymentId: string
  subscriptionId?: string | null
  amountCents: number
  dueDate?: string | null
  status: string
  billingKind: 'initial' | 'recurring' | 'unknown'
  invoiceUrl?: string | null
  confirmedAt?: string | null
}) {
  const admin = createAdminClient()
  const { error } = await admin.from('balcao_billing_payments').upsert({
    asaas_payment_id: input.paymentId,
    business_id: input.businessId,
    asaas_subscription_id: input.subscriptionId ?? null,
    amount_cents: input.amountCents,
    due_date: input.dueDate ?? null,
    status: input.status,
    billing_kind: input.billingKind,
    invoice_url: input.invoiceUrl ?? null,
    confirmed_at: input.confirmedAt ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'asaas_payment_id' })
  if (error) throw error
}
