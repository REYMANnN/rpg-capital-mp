import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessRole, getCurrentUser, getStoreBusiness } from '@/lib/accounts/currentUser'
import { writeAuditEvent } from '@/lib/accounts/audit'

async function check(userId: string, storeId: string) { const store = await getStoreBusiness(storeId); if (!store || !await getBusinessRole(userId, store.businessId)) return null; return store }
export async function GET(request: Request) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const storeId = new URL(request.url).searchParams.get('storeId') ?? ''; const store = await check(user.id, storeId); if (!store) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  const admin = createAdminClient(); const { data, error } = await admin.from('balcao_terminals').select('id, display_name, active, last_seen_at, created_at').eq('store_id', storeId).order('created_at')
  if (error) return NextResponse.json({ error: 'Não conseguimos carregar os dispositivos.' }, { status: 500 })
  return NextResponse.json({ terminals: (data ?? []).map((x) => ({ id: x.id, displayName: x.display_name, active: x.active, lastSeenAt: x.last_seen_at, createdAt: x.created_at })) })
}
export async function DELETE(request: Request) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const parsed = z.object({ storeId: z.string().uuid(), terminalId: z.string().uuid() }).safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: 'Dispositivo inválido.' }, { status: 400 })
  const store = await check(user.id, parsed.data.storeId); if (!store) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  const admin = createAdminClient(); await admin.from('balcao_terminals').update({ active: false, updated_at: new Date().toISOString() }).eq('id', parsed.data.terminalId).eq('store_id', parsed.data.storeId); await admin.from('balcao_staff_sessions').update({ revoked_at: new Date().toISOString() }).eq('terminal_id', parsed.data.terminalId).is('revoked_at', null)
  await writeAuditEvent({ businessId: store.businessId, storeId: parsed.data.storeId, actorUserId: user.id, terminalId: parsed.data.terminalId, action: 'terminal.revoked', entityType: 'terminal', entityId: parsed.data.terminalId }).catch(() => {})
  return NextResponse.json({ ok: true })
}
