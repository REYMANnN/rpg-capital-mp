import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getBusinessRole, getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'
import { parseStoreCreate } from '@/lib/accounts/payloads'
import { writeAuditEvent } from '@/lib/accounts/audit'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  return NextResponse.json({ businesses: await getManagementContext(user.id) })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Entre com Google para continuar.' }, { status: 401 })
  const parsed = parseStoreCreate(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Confira os dados da loja.' }, { status: 400 })
  const input = parsed.data
  const role = await getBusinessRole(user.id, input.businessId)
  if (!role) return NextResponse.json({ error: 'Você não tem acesso a este negócio.' }, { status: 403 })

  const { data: store, error } = await supabaseAdmin.from('inventory_v1_stores').insert({
    installation_id: randomUUID(), display_name: input.displayName, system_tag: 'inventory', business_id: input.businessId,
    business_type: input.businessType, cep: input.cep, street: input.street, address_number: input.number,
    complement: input.complement || null, neighborhood: input.neighborhood || null, city: input.city, state: input.state, active: true,
  }).select('id, display_name').single()
  if (error || !store) return NextResponse.json({ error: 'Não conseguimos criar a loja.' }, { status: 500 })
  try { await writeAuditEvent({ businessId: input.businessId, storeId: store.id, actorUserId: user.id, action: 'store.created', entityType: 'store', entityId: store.id }) } catch { /* store creation remains valid */ }
  return NextResponse.json({ store }, { status: 201 })
}
