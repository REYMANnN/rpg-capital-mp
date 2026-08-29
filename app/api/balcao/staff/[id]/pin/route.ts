import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessRole, getCurrentUser, getStoreBusiness } from '@/lib/accounts/currentUser'
import { hashPin } from '@/lib/accounts/pin'
import { writeAuditEvent } from '@/lib/accounts/audit'

const schema = z.object({ storeId: z.string().uuid(), pin: z.string().regex(/^\d{4}$/) })
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: 'O novo PIN deve ter 4 números.' }, { status: 400 })
  const { id } = await params; const store = await getStoreBusiness(parsed.data.storeId); if (!store || !await getBusinessRole(user.id, store.businessId)) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  const admin = createAdminClient(); const pinHash = await hashPin(parsed.data.pin)
  const { error } = await admin.from('balcao_staff_profiles').update({ pin_hash: pinHash, failed_pin_attempts: 0, locked_until: null, updated_at: new Date().toISOString() }).eq('id', id).eq('business_id', store.businessId)
  if (error) return NextResponse.json({ error: 'Não conseguimos redefinir o PIN.' }, { status: 500 })
  await admin.from('balcao_staff_sessions').update({ revoked_at: new Date().toISOString() }).eq('staff_id', id).is('revoked_at', null)
  await writeAuditEvent({ businessId: store.businessId, storeId: parsed.data.storeId, actorUserId: user.id, action: 'staff.pin_reset', entityType: 'staff', entityId: id }).catch(() => {})
  return NextResponse.json({ ok: true })
}
