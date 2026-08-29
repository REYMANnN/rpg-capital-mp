import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessRole, getCurrentUser, getStoreBusiness } from '@/lib/accounts/currentUser'
import { parseInviteCreate } from '@/lib/accounts/payloads'
import { hashSecret, INVITE_TTL_MS, makeSecret } from '@/lib/accounts/terminal'
import { writeAuditEvent } from '@/lib/accounts/audit'

export async function POST(request: Request) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const parsed = parseInviteCreate(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Confira os dados.' }, { status: 400 })
  const store = await getStoreBusiness(parsed.data.storeId); if (!store || !await getBusinessRole(user.id, store.businessId)) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  const token = makeSecret(); const admin = createAdminClient(); const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString()
  const { data: invite, error } = await admin.from('balcao_terminal_invites').insert({ store_id: parsed.data.storeId, token_hash: hashSecret(token), display_name: parsed.data.displayName, expires_at: expiresAt, created_by: user.id }).select('id').single()
  if (error || !invite) return NextResponse.json({ error: 'Não conseguimos gerar o link.' }, { status: 500 })
  const url = new URL(request.url); const activationUrl = `${url.origin}/activate/${token}`
  await writeAuditEvent({ businessId: store.businessId, storeId: parsed.data.storeId, actorUserId: user.id, action: 'terminal.invite_created', entityType: 'terminal_invite', entityId: invite.id }).catch(() => {})
  return NextResponse.json({ activationUrl, expiresAt })
}
