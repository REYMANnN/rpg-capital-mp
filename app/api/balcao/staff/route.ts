import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessRole, getCurrentUser, getStoreBusiness } from '@/lib/accounts/currentUser'
import { parseStaffCreate } from '@/lib/accounts/payloads'
import { hashPin } from '@/lib/accounts/pin'
import { writeAuditEvent } from '@/lib/accounts/audit'

async function managerForStore(userId: string, storeId: string) {
  const store = await getStoreBusiness(storeId)
  if (!store) return null
  const role = await getBusinessRole(userId, store.businessId)
  return role ? { ...store, role } : null
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const storeId = new URL(request.url).searchParams.get('storeId') ?? ''
  const context = await managerForStore(user.id, storeId)
  if (!context) return NextResponse.json({ error: 'Sem acesso a esta loja.' }, { status: 403 })
  const admin = createAdminClient()
  const { data: accesses, error } = await admin.from('balcao_staff_store_access').select('staff_id, role, custom_permissions, active').eq('store_id', storeId)
  if (error) return NextResponse.json({ error: 'Não conseguimos carregar a equipe.' }, { status: 500 })
  const ids = (accesses ?? []).map((item) => item.staff_id)
  const { data: staff } = ids.length ? await admin.from('balcao_staff_profiles').select('id, display_name, active, google_user_id').in('id', ids) : { data: [] as any[] }
  const result = (accesses ?? []).map((access) => {
    const person = (staff ?? []).find((item) => item.id === access.staff_id)
    return { id: access.staff_id, displayName: person?.display_name ?? 'Funcionário', role: access.role, active: Boolean(person?.active && access.active), googleLinked: Boolean(person?.google_user_id) }
  })
  return NextResponse.json({ staff: result })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Entre com Google para continuar.' }, { status: 401 })
  const parsed = parseStaffCreate(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Confira os dados.' }, { status: 400 })
  const input = parsed.data
  const context = await managerForStore(user.id, input.storeId)
  if (!context) return NextResponse.json({ error: 'Sem permissão para gerenciar esta loja.' }, { status: 403 })
  const admin = createAdminClient()
  const pinHash = await hashPin(input.pin)
  const { data: person, error: personError } = await admin.from('balcao_staff_profiles').insert({ business_id: context.businessId, display_name: input.displayName, pin_hash: pinHash, created_by: user.id }).select('id, display_name').single()
  if (personError || !person) return NextResponse.json({ error: 'Não conseguimos criar o funcionário.' }, { status: 500 })
  const { error: accessError } = await admin.from('balcao_staff_store_access').insert({ staff_id: person.id, store_id: input.storeId, role: input.role, custom_permissions: input.customPermissions, active: true })
  if (accessError) { await admin.from('balcao_staff_profiles').delete().eq('id', person.id); return NextResponse.json({ error: 'Não conseguimos liberar o acesso à loja.' }, { status: 500 }) }
  await writeAuditEvent({ businessId: context.businessId, storeId: input.storeId, actorUserId: user.id, action: 'staff.created', entityType: 'staff', entityId: person.id, metadata: { role: input.role } }).catch(() => {})
  return NextResponse.json({ staff: { id: person.id, displayName: person.display_name, role: input.role, active: true } }, { status: 201 })
}
