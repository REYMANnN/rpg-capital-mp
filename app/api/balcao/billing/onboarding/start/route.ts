import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessRole } from '@/lib/accounts/currentUser'
import { normalizeDigits } from '@/lib/accounts/validation'
import { BANK_PRICE_CENTS, isBillingBypassEmail } from '@/lib/billing/config'
import { getBusinessBillingState } from '@/lib/billing/access'
import { createRecurringCheckout, ensureAsaasCustomer } from '@/lib/asaas/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function brazilDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Entre com sua Conta Google para continuar.' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { businessId?: unknown }
  const businessId = typeof body.businessId === 'string' ? body.businessId : ''
  if (!businessId) return NextResponse.json({ error: 'Empresa não identificada.' }, { status: 400 })

  const role = await getBusinessRole(user.id, businessId)
  if (role !== 'owner') return NextResponse.json({ error: 'Somente o responsável pela empresa pode ativar a assinatura.' }, { status: 403 })

  if (isBillingBypassEmail(user.email)) {
    return NextResponse.json({ ok: true, bypass: true, active: true })
  }

  const state = await getBusinessBillingState(businessId, user.email)
  if (state.status === 'active') return NextResponse.json({ ok: true, active: true, alreadyActive: true })

  const admin = createAdminClient()
  const { data: business } = await admin.from('balcao_businesses')
    .select('id, display_name, tax_id, phone')
    .eq('id', businessId)
    .eq('active', true)
    .maybeSingle()
  if (!business) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 })

  const document = normalizeDigits(business.tax_id || '')
  if (![11, 14].includes(document.length)) {
    return NextResponse.json({ error: 'Complete o CPF/CNPJ da empresa antes de ativar o pagamento.' }, { status: 409 })
  }

  const idempotencyKey = `initial:${businessId}`
  const { data: previous } = await admin.from('balcao_billing_operations')
    .select('id, status, metadata')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()
  const previousUrl = previous?.metadata && typeof previous.metadata === 'object'
    ? (previous.metadata as Record<string, unknown>).checkoutUrl
    : null
  if (previous?.status === 'processing' && typeof previousUrl === 'string' && previousUrl) {
    return NextResponse.json({ ok: true, checkoutUrl: previousUrl, pending: true })
  }

  try {
    const customer = await ensureAsaasCustomer({
      name: business.display_name,
      cpfCnpj: document,
      email: user.email ?? null,
      mobilePhone: business.phone ?? null,
      externalReference: `balcao:${businessId}`,
    })

    const origin = new URL(request.url).origin
    const checkout = await createRecurringCheckout({
      customer: customer.id,
      valueCents: BANK_PRICE_CENTS,
      nextDueDate: brazilDate(),
      externalReference: `balcao:${businessId}:initial`,
      successUrl: `${origin}/onboarding?billing=success`,
      cancelUrl: `${origin}/onboarding?billing=cancel`,
      expiredUrl: `${origin}/onboarding?billing=expired`,
    })

    const { data: operation, error: operationError } = await admin.from('balcao_billing_operations').upsert({
      business_id: businessId,
      operation_type: 'initial_subscription',
      quantity_delta: 1,
      amount_cents: BANK_PRICE_CENTS,
      status: 'processing',
      idempotency_key: idempotencyKey,
      metadata: { checkoutId: checkout.id, checkoutUrl: checkout.url },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'idempotency_key' }).select('id').single()
    if (operationError) throw operationError

    const { error: accountError } = await admin.from('balcao_billing_accounts').upsert({
      business_id: businessId,
      provider: 'asaas',
      asaas_customer_id: customer.id,
      status: 'pending_payment',
      price_per_bank_cents: BANK_PRICE_CENTS,
      current_bank_count: 0,
      next_bank_count: 1,
      current_amount_cents: 0,
      next_amount_cents: BANK_PRICE_CENTS,
      provider_sync_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id' })
    if (accountError) throw accountError

    return NextResponse.json({ ok: true, checkoutUrl: checkout.url, operationId: operation.id })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Não foi possível iniciar o pagamento.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
