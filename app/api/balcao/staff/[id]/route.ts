import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessRole, getCurrentUser, getStoreBusiness } from '@/lib/accounts/currentUser'
import { writeAuditEvent } from '@/lib/accounts/audit'

const schema = z.object({ storeId: z.string().uuid(), displayName: z.string().trim().min(2).max(80).optional(), role: z.enum(['stock','cashier','manager','custom']).optional(), customPermissions: z.array(z.string()).max(30).optional(), active: z.boolean().optional() })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: 'Confira os dados do funcionário.' }, { status: 400 })
  const { id } = await params; const input = parsed.data
  const store = await getStoreBusiness(input.storeId); if (!store || !await getBusinessRole(user.id, store.businessId)) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  const admin = createAdminClient()
  if (input.displayName !== undefined || input.active !== undefined) {
    const values: Record<string, unknown> = { updated_at: new Date().toISOString() }; if (input.displayName !== undefined) values.display_name = input.displayName; if (input.active !== undefined) values.active = input.active
    const { error } = await admin.from('balcao_staff_profiles').update(values).eq('id', id).eq('business_id', store.businessId); if (error) return NextResponse.json({ error: 'Não conseguimos atualizar o funcionário.' }, { status: 500 })
  }
  if (input.role !== undefined || input.customPermissions !== undefined || input.active !== undefined) {
    const values: Record<string, unknown> = { updated_at: new Date().toISOString() }; if (input.role !== undefined) values.role = input.role; if (input.customPermissions !== undefined) values.custom_permissions = input.customPermissions; if (input.active !== undefined) values.active = input.active
    const { error } = await admin.from('balcao_staff_store_access').update(values).eq('staff_id', id).eq('store_id', input.storeId); if (error) return NextResponse.json({ error: 'Não conseguimos atualizar as permissões.' }, { status: 500 })
  }
  if (input.active === false) await admin.from('balcao_staff_sessions').update({ revoked_at: new Date().toISOString() }).eq('staff_id', id).is('revoked_at', null)
  await writeAuditEvent({ businessId: store.businessId, storeId: input.storeId, actorUserId: user.id, action: input.active === false ? 'staff.deactivated' : 'staff.updated', entityType: 'staff', entityId: id }).catch(() => {})
  return NextResponse.json({ ok: true })
}
