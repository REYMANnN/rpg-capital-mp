import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { hashSecret, INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE, unpackCredential } from '@/lib/accounts/terminal'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const requestedStoreId = new URL(request.url).searchParams.get('storeId') || null
  const jar = await cookies()
  const terminal = unpackCredential(jar.get(TERMINAL_COOKIE)?.value)
  const session = unpackCredential(jar.get(STAFF_SESSION_COOKIE)?.value)
  const installationId = jar.get(INVENTORY_INSTALLATION_COOKIE)?.value ?? null

  const { data, error } = await supabase.rpc('balcao_list_finance_connections', {
    p_store_id: requestedStoreId,
    p_installation_id: installationId,
    p_terminal_id: terminal?.id ?? null,
    p_terminal_hash: terminal ? hashSecret(terminal.secret) : null,
    p_session_id: session?.id ?? null,
    p_session_hash: session ? hashSecret(session.secret) : null,
  })

  if (error || !data || typeof data !== 'object') {
    console.error('BALCAO finance connections RPC failed', error)
    return NextResponse.json({ error: 'Não foi possível carregar as conexões bancárias.' }, { status: 403 })
  }

  const source = data as Record<string, unknown>
  const connections = Array.isArray(source.connections) ? source.connections : []

  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.MALVO_CLIENT_ID?.trim() && process.env.MALVO_CLIENT_SECRET?.trim() && process.env.MALVO_WEBHOOK_SECRET?.trim()),
    canManage: source.canManage === true,
    connections,
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
