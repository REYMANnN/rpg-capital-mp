import { NextResponse } from 'next/server'
import { cancelAsaasSubscription } from '@/lib/asaas/client'
import { getBusinessRole } from '@/lib/accounts/currentUser'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Entre na sua conta para continuar.' }, { status: 401 })

  const body = await request.json().catch(() => null) as { businessId?: unknown; confirmation?: unknown } | null
  const businessId = typeof body?.businessId === 'string' ? body.businessId.trim() : ''
  const confirmation = typeof body?.confirmation === 'string' ? body.confirmation.trim().toUpperCase() : ''

  if (!businessId || confirmation !== 'CANCELAR') {
    return NextResponse.json({ error: 'Confirme o cancelamento para continuar.' }, { status: 400 })
  }

  const role = await getBusinessRole(user.id, businessId)
  if (role !== 'owner') {
    return NextResponse.json({ error: 'Somente o proprietário pode cancelar esta conta.' }, { status: 403 })
  }

  const { data: billing, error: billingError } = await supabase
    .from('balcao_billing_accounts')
    .select('asaas_initial_subscription_id, asaas_recurring_subscription_id')
    .eq('business_id', businessId)
    .maybeSingle()

  if (billingError) {
    console.error('BALCAO account cancellation billing read failed', { code: billingError.code })
    return NextResponse.json({ error: 'Não conseguimos preparar o cancelamento agora. Tente novamente.' }, { status: 500 })
  }

  const subscriptionIds = Array.from(new Set([
    billing?.asaas_recurring_subscription_id,
    billing?.asaas_initial_subscription_id,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)))

  try {
    for (const subscriptionId of subscriptionIds) {
      await cancelAsaasSubscription(subscriptionId)
    }
  } catch (caught) {
    const error = caught as Error & { status?: number }
    console.error('BALCAO Asaas cancellation failed', { status: error.status })
    return NextResponse.json({ error: 'Não conseguimos cancelar a cobrança recorrente agora. Nada foi encerrado; tente novamente.' }, { status: 502 })
  }

  const { error: cancelError } = await supabase.rpc('balcao_cancel_business_account', {
    p_business_id: businessId,
  })

  if (cancelError) {
    console.error('BALCAO account cancellation RPC failed', { code: cancelError.code })
    return NextResponse.json({ error: 'A cobrança foi interrompida, mas não conseguimos concluir o encerramento da conta. Fale com a equipe.' }, { status: 500 })
  }

  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}
