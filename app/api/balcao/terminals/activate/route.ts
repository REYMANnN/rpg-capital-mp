import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashSecret, INVENTORY_INSTALLATION_COOKIE, makeSecret, packCredential, STAFF_SESSION_COOKIE, TERMINAL_COOKIE } from '@/lib/accounts/terminal'
import { writeAuditEvent } from '@/lib/accounts/audit'

const schema = z.object({ token: z.string().min(20) })
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: 'Este link é inválido.' }, { status: 400 })
  const admin = createAdminClient(); const now = new Date().toISOString(); const tokenHash = hashSecret(parsed.data.token)
  const { data: claimed, error: claimError } = await admin.from('balcao_terminal_invites').update({ used_at: now }).eq('token_hash', tokenHash).is('used_at', null).is('revoked_at', null).gt('expires_at', now).select('id, store_id, display_name').maybeSingle()
  if (claimError || !claimed) return NextResponse.json({ error: 'Este link expirou, já foi usado ou foi cancelado. Peça um novo ao gerente.' }, { status: 410 })
  const { data: store } = await admin.from('inventory_v1_stores').select('business_id, installation_id, display_name').eq('id', claimed.store_id).eq('active', true).maybeSingle()
  if (!store?.business_id || !store.installation_id) return NextResponse.json({ error: 'A loja deste link não está mais disponível.' }, { status: 410 })
  const secret = makeSecret(); const { data: terminal, error } = await admin.from('balcao_terminals').insert({ store_id: claimed.store_id, display_name: claimed.display_name || 'Dispositivo', credential_hash: hashSecret(secret), user_agent: request.headers.get('user-agent') }).select('id').single()
  if (error || !terminal) { await admin.from('balcao_terminal_invites').update({ used_at: null }).eq('id', claimed.id); return NextResponse.json({ error: 'Não conseguimos ativar este dispositivo.' }, { status: 500 }) }
  const response = NextResponse.json({ ok: true, storeName: store.display_name })
  response.cookies.set(TERMINAL_COOKIE, packCredential(terminal.id, secret), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 180 })
  response.cookies.set(INVENTORY_INSTALLATION_COOKIE, store.installation_id, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 * 2 })
  response.cookies.delete(STAFF_SESSION_COOKIE)
  await writeAuditEvent({ businessId: store.business_id, storeId: claimed.store_id, terminalId: terminal.id, action: 'terminal.activated', entityType: 'terminal', entityId: terminal.id }).catch(() => {})
  return response
}
