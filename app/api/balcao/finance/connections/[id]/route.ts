import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { deleteMalvoItem } from '@/lib/malvo/client'

export const dynamic = 'force-dynamic'

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const supabase = await createServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Entre com sua Conta Google para continuar.' }, { status: 401 })

  const admin = createAdminClient()
  const { data: connection, error: connectionError } = await admin.from('balcao_finance_connections')
    .select('id,business_id,store_id,provider,provider_item_id,status')
    .eq('id', id)
    .maybeSingle()

  if (connectionError) return NextResponse.json({ error: 'Não foi possível carregar a conexão.' }, { status: 500 })
  if (!connection) return NextResponse.json({ error: 'Conexão não encontrada.' }, { status: 404 })

  const { data: membership, error: membershipError } = await supabase.from('balcao_business_members')
    .select('role')
    .eq('business_id', connection.business_id)
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle()

  if (membershipError || !membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Somente a gestão pode desconectar uma conta bancária.' }, { status: 403 })
  }

  if (connection.status === 'disconnected') return NextResponse.json({ ok: true, alreadyDisconnected: true })
  if (connection.provider !== 'malvo') return NextResponse.json({ error: 'Provedor bancário não suportado.' }, { status: 400 })

  try {
    await deleteMalvoItem(connection.provider_item_id)
  } catch (caught) {
    const status = (caught as Error & { status?: number })?.status
    if (status !== 404) {
      console.error('BALCAO Malvo disconnect failed', caught)
      return NextResponse.json({ error: 'Não foi possível revogar o consentimento bancário agora.' }, { status: 502 })
    }
  }

  const now = new Date().toISOString()
  await Promise.all([
    admin.from('balcao_finance_connections').update({ status: 'disconnected', updated_at: now }).eq('id', connection.id),
    admin.from('balcao_finance_accounts').update({ status: 'disconnected', updated_at: now })
      .eq('business_id', connection.business_id)
      .eq('store_id', connection.store_id)
      .eq('provider', 'malvo'),
  ])

  return NextResponse.json({ ok: true })
}
