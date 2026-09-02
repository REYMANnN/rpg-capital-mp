import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { deleteMalvoItem } from '@/lib/malvo/client'

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

  return NextResponse.json({ ok: true })
}
