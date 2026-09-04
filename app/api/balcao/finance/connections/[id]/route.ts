import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteMalvoItem } from '@/lib/malvo/client'
import { deleteSubscription } from '@/lib/asaas/client'
import { retireBillingSlot } from '@/lib/billing/access'
import { isBillingBypassEmail, monthlyAmountCents } from '@/lib/billing/config'

export const dynamic = 'force-dynamic'

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const supabase = await createServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Entre com sua Conta Google para continuar.' }, { status: 401 })

  const { data, error } = await supabase.rpc('balcao_get_finance_connection_for_management', {
    p_connection_id: id,
  })

  if (error || !data || typeof data !== 'object') {
    const missing = String(error?.message || '').includes('BALCAO_FINANCE_CONNECTION_NOT_FOUND')
    return NextResponse.json({ error: missing ? 'Conexão não encontrada.' : 'Somente a gestão pode remover uma conta bancária.' }, { status: missing ? 404 : 403 })
  }

  const connection = data as Record<string, unknown>
  const status = typeof connection.status === 'string' ? connection.status : ''
  const provider = typeof connection.provider === 'string' ? connection.provider : ''
  const itemId = typeof connection.itemId === 'string' ? connection.itemId : ''

  if (status === 'disconnected') return NextResponse.json({ ok: true, alreadyDisconnected: true })
  if (provider !== 'malvo' || !itemId) return NextResponse.json({ error: 'Provedor bancário não suportado.' }, { status: 400 })

  const bypass = isBillingBypassEmail(user.email)
  const admin = createAdminClient()
  const [{ data: localConnection }, { data: slot }] = await Promise.all([
    admin.from('balcao_finance_connections').select('id, business_id').eq('id', id).maybeSingle(),
    bypass
      ? Promise.resolve({ data: null })
      : admin.from('balcao_billing_slots').select('id, business_id, asaas_subscription_id').eq('finance_connection_id', id).maybeSingle(),
  ])

  try {
    await deleteMalvoItem(itemId)
  } catch (caught) {
    const remoteStatus = (caught as Error & { status?: number })?.status
    if (remoteStatus !== 404) {
      console.error('BALCAO Malvo disconnect failed', caught)
      return NextResponse.json({ error: 'Não foi possível revogar o consentimento bancário agora.' }, { status: 502 })
    }
  }

  const { error: disconnectError } = await supabase.rpc('balcao_disconnect_finance_connection', {
    p_connection_id: id,
  })
  if (disconnectError) {
    console.error('BALCAO finance disconnect RPC failed', disconnectError)
    return NextResponse.json({ error: 'O banco foi desconectado, mas não foi possível atualizar o BALCÃO.' }, { status: 500 })
  }

  if (bypass || !localConnection?.business_id) return NextResponse.json({ ok: true, bypass })

  let billingSyncPending = false
  const businessId = localConnection.business_id as string
  try {
    await retireBillingSlot(id)
  } catch (caught) {
    console.error('BALCAO billing slot retirement failed', caught)
    billingSyncPending = true
  }

  const { data: account } = await admin.from('balcao_billing_accounts')
    .select('next_bank_count')
    .eq('business_id', businessId)
    .maybeSingle()
  const nextBankCount = Math.max(0, (account?.next_bank_count ?? 1) - 1)
  const nextAmountCents = monthlyAmountCents(nextBankCount)
  await admin.from('balcao_billing_accounts').update({
    next_bank_count: nextBankCount,
    next_amount_cents: nextAmountCents,
    updated_at: new Date().toISOString(),
  }).eq('business_id', businessId)

  if (slot?.asaas_subscription_id) {
    try {
      await deleteSubscription(slot.asaas_subscription_id)
      await admin.from('balcao_billing_accounts').update({ provider_sync_error: null, updated_at: new Date().toISOString() }).eq('business_id', businessId)
    } catch (caught) {
      const remoteStatus = (caught as Error & { status?: number })?.status
      if (remoteStatus !== 404) {
        billingSyncPending = true
        const message = caught instanceof Error ? caught.message : 'Falha ao encerrar a recorrência no Asaas.'
        console.error('BALCAO Asaas subscription cancellation failed', caught)
        await admin.from('balcao_billing_accounts').update({ provider_sync_error: message, updated_at: new Date().toISOString() }).eq('business_id', businessId)
      }
    }
  } else {
    billingSyncPending = true
    await admin.from('balcao_billing_accounts').update({
      provider_sync_error: 'A conexão foi removida antes de o Asaas informar o identificador da assinatura. A recorrência precisa ser conciliada.',
      updated_at: new Date().toISOString(),
    }).eq('business_id', businessId)
  }

  return NextResponse.json({ ok: true, billingSyncPending, nextBankCount, nextAmountCents })
}
