import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getBusinessRole, getStoreBusiness } from '@/lib/accounts/currentUser'
import { normalizeDigits } from '@/lib/accounts/validation'
import { buildBillingPlan } from '@/lib/billing/policy'
import {
  ensureAsaasCreditCardSubscription,
  ensureAsaasCustomer,
  type AsaasCreditCard,
  type AsaasCreditCardHolderInfo,
} from '@/lib/asaas/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type SetupBody = {
  storeId?: unknown
  acceptedRecurringBilling?: unknown
  creditCard?: Partial<AsaasCreditCard> | null
  creditCardHolderInfo?: Partial<AsaasCreditCardHolderInfo> | null
}

function brazilDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function clientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || ''
}

function cleanCard(value: Partial<AsaasCreditCard> | null | undefined): AsaasCreditCard | null {
  const holderName = typeof value?.holderName === 'string' ? value.holderName.trim() : ''
  const number = typeof value?.number === 'string' ? normalizeDigits(value.number) : ''
  const expiryMonth = typeof value?.expiryMonth === 'string' ? normalizeDigits(value.expiryMonth).padStart(2, '0').slice(-2) : ''
  const expiryYear = typeof value?.expiryYear === 'string' ? normalizeDigits(value.expiryYear) : ''
  const ccv = typeof value?.ccv === 'string' ? normalizeDigits(value.ccv) : ''
  if (holderName.length < 3 || number.length < 13 || number.length > 19 || !/^\d{2}$/.test(expiryMonth) || !/^\d{4}$/.test(expiryYear) || !/^\d{3,4}$/.test(ccv)) return null
  const month = Number(expiryMonth)
  if (month < 1 || month > 12) return null
  return { holderName, number, expiryMonth, expiryYear, ccv }
}

function cleanHolder(value: Partial<AsaasCreditCardHolderInfo> | null | undefined): AsaasCreditCardHolderInfo | null {
  const name = typeof value?.name === 'string' ? value.name.trim() : ''
  const email = typeof value?.email === 'string' ? value.email.trim().toLowerCase() : ''
  const cpfCnpj = typeof value?.cpfCnpj === 'string' ? normalizeDigits(value.cpfCnpj) : ''
  const postalCode = typeof value?.postalCode === 'string' ? normalizeDigits(value.postalCode) : ''
  const addressNumber = typeof value?.addressNumber === 'string' ? value.addressNumber.trim() : ''
  const addressComplement = typeof value?.addressComplement === 'string' ? value.addressComplement.trim() : ''
  const phone = typeof value?.phone === 'string' ? normalizeDigits(value.phone) : ''
  const mobilePhone = typeof value?.mobilePhone === 'string' ? normalizeDigits(value.mobilePhone) : ''
  if (name.length < 3 || !email.includes('@') || ![11, 14].includes(cpfCnpj.length) || postalCode.length !== 8 || !addressNumber) return null
  return {
    name,
    email,
    cpfCnpj,
    postalCode,
    addressNumber,
    ...(addressComplement ? { addressComplement } : {}),
    ...(phone ? { phone } : {}),
    ...(mobilePhone ? { mobilePhone } : {}),
  }
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Entre com sua Conta Google para continuar.' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as SetupBody
  const storeId = typeof body.storeId === 'string' ? body.storeId : ''
  if (!storeId) return NextResponse.json({ error: 'Loja não identificada.' }, { status: 400 })
  if (body.acceptedRecurringBilling !== true) return NextResponse.json({ error: 'Confirme a autorização da cobrança recorrente para continuar.' }, { status: 400 })

  const card = cleanCard(body.creditCard)
  const holder = cleanHolder(body.creditCardHolderInfo)
  if (!card || !holder) return NextResponse.json({ error: 'Confira os dados do cartão e do titular.' }, { status: 400 })

  const store = await getStoreBusiness(storeId)
  if (!store) return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 })
  const role = await getBusinessRole(user.id, store.businessId)
  if (!role || !['owner', 'admin'].includes(role)) return NextResponse.json({ error: 'Somente o responsável pela conta pode configurar a cobrança.' }, { status: 403 })

  const [{ data: business, error: businessError }, { data: current, error: currentError }] = await Promise.all([
    supabase.from('balcao_businesses').select('display_name,tax_id,phone').eq('id', store.businessId).maybeSingle(),
    supabase.from('balcao_billing_accounts').select('status,asaas_customer_id,asaas_initial_subscription_id,asaas_recurring_subscription_id,first_due_date,next_due_date').eq('business_id', store.businessId).maybeSingle(),
  ])
  if (businessError || !business) return NextResponse.json({ error: 'Não foi possível carregar os dados do negócio.' }, { status: 500 })
  if (currentError) return NextResponse.json({ error: 'Não foi possível preparar a cobrança.' }, { status: 500 })

  if (current && ['configured', 'active'].includes(current.status) && current.asaas_recurring_subscription_id) {
    return NextResponse.json({ ok: true, alreadyConfigured: true, firstDueDate: current.first_due_date, nextDueDate: current.next_due_date })
  }

  const remoteIp = clientIp(request)
  if (!remoteIp) return NextResponse.json({ error: 'Não foi possível validar a origem da configuração do cartão. Atualize a página e tente novamente.' }, { status: 400 })

  try {
    const customer = await ensureAsaasCustomer({
      name: business.display_name || holder.name,
      cpfCnpj: normalizeDigits(business.tax_id || holder.cpfCnpj),
      email: user.email || holder.email,
      phone: normalizeDigits(business.phone || holder.phone || holder.mobilePhone || ''),
      externalReference: `balcao:business:${store.businessId}`,
    }) as Record<string, unknown>
    const customerId = typeof customer.id === 'string' ? customer.id : ''
    if (!customerId) throw new Error('Asaas customer returned no id')

    const plan = buildBillingPlan(brazilDate())
    let initialSubscriptionId = ''
    if (plan.initialCharge) {
      const initial = await ensureAsaasCreditCardSubscription({
        customer: customerId,
        value: plan.initialCharge.amountCents / 100,
        nextDueDate: plan.initialCharge.dueDate,
        maxPayments: plan.initialCharge.maxPayments,
        description: 'BALCÃO — primeiro ciclo (mês de entrada + mês corrente)',
        externalReference: `balcao:${store.businessId}:initial`,
        creditCard: card,
        creditCardHolderInfo: holder,
        remoteIp,
      }) as Record<string, unknown>
      initialSubscriptionId = typeof initial.id === 'string' ? initial.id : ''
      if (!initialSubscriptionId) throw new Error('Asaas initial subscription returned no id')
    }

    const recurring = await ensureAsaasCreditCardSubscription({
      customer: customerId,
      value: plan.recurring.amountCents / 100,
      nextDueDate: plan.recurring.firstDueDate,
      description: 'BALCÃO — assinatura mensal',
      externalReference: `balcao:${store.businessId}:recurring`,
      creditCard: card,
      creditCardHolderInfo: holder,
      remoteIp,
    }) as Record<string, unknown>
    const recurringSubscriptionId = typeof recurring.id === 'string' ? recurring.id : ''
    if (!recurringSubscriptionId) throw new Error('Asaas recurring subscription returned no id')

    const firstDueDate = plan.initialCharge?.dueDate ?? plan.recurring.firstDueDate
    const { error: saveError } = await supabase.rpc('balcao_configure_billing', {
      p_store_id: storeId,
      p_asaas_customer_id: customerId,
      p_asaas_initial_subscription_id: initialSubscriptionId,
      p_asaas_recurring_subscription_id: recurringSubscriptionId,
      p_first_due_date: firstDueDate,
      p_next_due_date: firstDueDate,
    })
    if (saveError) throw saveError

    return NextResponse.json({
      ok: true,
      firstAmountCents: plan.initialCharge?.amountCents ?? plan.recurring.amountCents,
      firstDueDate,
      recurringAmountCents: 599,
      recurringFirstDueDate: plan.recurring.firstDueDate,
    })
  } catch (caught) {
    const error = caught as Error & { status?: number }
    const missingConfig = /ASAAS_API_KEY.*not configured/i.test(error.message)
    console.error('BALCAO Asaas billing setup failed', { status: error.status ?? null, missingConfig })
    if (missingConfig) return NextResponse.json({ error: 'A cobrança ainda não está configurada no servidor.' }, { status: 503 })
    if (error.status === 400 || error.status === 422) return NextResponse.json({ error: 'O Asaas recusou os dados informados. Confira o cartão e os dados do titular.' }, { status: 400 })
    return NextResponse.json({ error: 'Não foi possível configurar a cobrança agora. Nenhum dado de cartão foi armazenado; tente novamente.' }, { status: 502 })
  }
}
