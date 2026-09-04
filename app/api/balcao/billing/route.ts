import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getBusinessRole, getStoreBusiness } from '@/lib/accounts/currentUser'
import { getBusinessBillingState } from '@/lib/billing/access'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Entre com sua Conta Google para continuar.' }, { status: 401 })

  const url = new URL(request.url)
  let businessId = url.searchParams.get('businessId') || ''
  const storeId = url.searchParams.get('storeId') || ''
  if (!businessId && storeId) businessId = (await getStoreBusiness(storeId))?.businessId || ''
  if (!businessId) return NextResponse.json({ error: 'Empresa não identificada.' }, { status: 400 })

  const role = await getBusinessRole(user.id, businessId)
  if (!role) return NextResponse.json({ error: 'Seu perfil não pertence a esta empresa.' }, { status: 403 })

  try {
    const state = await getBusinessBillingState(businessId, user.email)
    return NextResponse.json({
      ok: true,
      businessId,
      bypass: state.bypass,
      status: state.status,
      allowed: state.allowed,
      pricePerBankCents: state.pricePerBankCents,
      currentBankCount: state.currentBankCount,
      nextBankCount: state.nextBankCount,
      currentAmountCents: state.currentAmountCents,
      nextAmountCents: state.nextAmountCents,
      paidUntil: state.paidUntil,
      availableSlots: state.availableSlots,
      paymentMethod: state.cardLast4 ? {
        brand: state.cardBrand,
        last4: state.cardLast4,
        expiryMonth: state.cardExpiryMonth,
        expiryYear: state.cardExpiryYear,
      } : null,
      providerSyncError: state.providerSyncError,
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  } catch (caught) {
    console.error('BALCAO billing state failed', caught)
    return NextResponse.json({ error: 'Não foi possível consultar a assinatura agora.' }, { status: 500 })
  }
}
