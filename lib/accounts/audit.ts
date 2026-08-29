import { createAdminClient } from '@/lib/supabase/admin'

export type AuditInput = {
  businessId?: string | null
  storeId?: string | null
  actorUserId?: string | null
  actorStaffId?: string | null
  terminalId?: string | null
  action: string
  entityType?: string | null
  entityId?: string | null
  metadata?: Record<string, unknown>
}

export async function writeAuditEvent(input: AuditInput): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('balcao_audit_events').insert({
    business_id: input.businessId ?? null,
    store_id: input.storeId ?? null,
    actor_user_id: input.actorUserId ?? null,
    actor_staff_id: input.actorStaffId ?? null,
    terminal_id: input.terminalId ?? null,
    action: input.action,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  })
  if (error) throw error
}
