import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessRole, getStoreBusiness } from '@/lib/accounts/currentUser'
import { BANK_PRICE_CENTS, isBillingBypassEmail } from '@/lib/billing/config'
import { getBusinessBillingState, hasBillingAccess } from '@/lib/billing/access'
import { createRecurringCheckout } from '@/lib/asaas/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function brazilDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Entre com sua Conta Google para continuar.' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { storeId?: unknown; businessId?: unknown }
  const storeId = typeof body.storeId === 'string' ? body.storeId : ''
  let businessId = typeof body.businessId === 'string' ? body.businessId : ''
  if (!businessId && storeId) businessId = (await getStoreBusiness(storeId))?.businessId || ''
  if (!businessId) return NextResponse.json({ error: 'Empresa não identificada.' }, { status: 400 })

  const role = await getBusinessRole(user.id, businessId)
  if (role !== 'owner') return NextResponse.json({ error: 'Somente o responsável pela empresa pode adicionar uma conta bancária.' }, { status: 403 })

  if (isBillingBypassEmail(user.email)) {
    return NextResponse.json({ ok: true, bypass: true, chargeRequired: false, readyToConnect: true })
  }

  const state = await getBusinessBillingState(businessId, user.email)
  if (!hasBillingAccess(state)) {
    return NextResponse.json({ error: 'Regularize a assinatura do BALCÃO antes de adicionar outra conta.' }, { status: 402 })
  }
  if (state.availableSlots > 0) {
    return NextResponse.json({ ok: true, chargeRequired: false, readyToConnect: true, availableSlots: state.availableSlots })
  }

  const admin = createAdminClient()
  const { data: recentOperations } = await admin.from('balcao_billing_operations')
    .select('id, metadata, created_at')
    .eq('business_id', businessId)
    .eq('operation_type', 'add_bank')
    .eq('status', 'processing')
    .order('created_at', { ascending: false })
    .limit(1)

  const recent = recentOperations?.[0]
  const checkoutUrl = recent?.metadata && typeof recent.metadata === 'object'
    ? (recent.metadata as Record<string, unknown>).checkoutUrl
    : null
  const ageMs = recent?.created_at ? Date.now() - new Date(recent.created_at).getTime() : Number.POSITIVE_INFINITY
  if (typeof checkoutUrl === 'string' && checkoutUrl && ageMs < 55 * 60 * 1000) {
    return NextResponse.json({ ok: true, chargeRequired: true, checkoutUrl, operationId: recent.id, pending: true })
  }

  const { data: account, error: accountError } = await admin.from('balcao_billing_accounts')
    .select('asaas_customer_id, next_bank_count, next_amount_cents')
    .eq('business_id', businessId)
    .maybeSingle()
  if (accountError) return NextResponse.json({ error: 'Não foi possível consultar a assinatura.' }, { status: 500 })
  if (!account?.asaas_customer_id) {
    return NextResponse.json({ error: 'A assinatura ainda não possui cliente de cobrança no Asaas.' }, { status: 409 })
  }

  const operationId = randomUUID()
  const idempotencyKey = `add:${businessId}:${operationId}`
  const { error: operationError } = await admin.from('balcao_billing_operations').insert({
    id: operationId,
    business_id: businessId,
    operation_type: 'add_bank',
    quantity_delta: 1,
    amount_cents: BANK_PRICE_CENTS,
    status: 'processing',
    idempotency_key: idempotencyKey,
    metadata: {},
  })
  if (operationError) return NextResponse.json({ error: 'Não foi possível iniciar a cobrança adicional.' }, { status: 500 })

  try {
    const origin = new URL(request.url).origin
    const checkout = await createRecurringCheckout({
      customer: account.asaas_customer_id,
      valueCents: BANK_PRICE_CENTS,
      nextDueDate: brazilDate(),
      externalReference: `balcao:${businessId}:add:${operationId}`,
      successUrl: `${origin}/inventory-v1?finance=connections&billing=success`,
      cancelUrl: `${origin}/inventory-v1?finance=connections&billing=cancel`,
      expiredUrl: `${origin}/inventory-v1?finance=connections&billing=expired`,
      itemName: 'BALCÃO - nova conta bancária',
      itemDescription: 'R$ 5,99 por mês para uma nova conta bancária conectada',
    })

    const { error: updateError } = await admin.from('balcao_billing_operations').update({
      metadata: {
        checkoutId: checkout.id,
        checkoutUrl: checkout.url,
        nextBankCountBefore: account.next_bank_count ?? 0,
        nextAmountBefore: account.next_amount_cents ?? 0,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', operationId)
    if (updateError) throw updateError

    return NextResponse.json({
      ok: true,
      chargeRequired: true,
      checkoutUrl: checkout.url,
      operationId,
      amountCents: BANK_PRICE_CENTS,
    })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Não foi possível criar o pagamento da nova conta.'
    await admin.from('balcao_billing_operations').update({
      status: 'failed', error_message: message, updated_at: new Date().toISOString(),
    }).eq('id', operationId)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
