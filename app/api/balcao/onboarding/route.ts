import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/accounts/currentUser'
import { validateOnboarding, normalizeDigits } from '@/lib/accounts/validation'
import { writeAuditEvent } from '@/lib/accounts/audit'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Entre com sua Conta Google para continuar.' }, { status: 401 })

  const parsed = validateOnboarding(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Confira os dados informados.' }, { status: 400 })
  const data = parsed.data
  const taxId = normalizeDigits(data.taxId)

  if (taxId.length === 14) {
    const { data: duplicate } = await supabaseAdmin.from('balcao_businesses').select('id').eq('tax_id', taxId).eq('active', true).neq('created_by', user.id).limit(1).maybeSingle()
    if (duplicate) return NextResponse.json({ error: 'Este CNPJ já está cadastrado. Peça acesso ao responsável pelo negócio.' }, { status: 409 })
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('balcao_business_members').select('business_id').eq('user_id', user.id).eq('active', true).limit(1).maybeSingle()
  if (membershipError) return NextResponse.json({ error: 'Não conseguimos verificar sua conta.' }, { status: 500 })

  let businessId = membership?.business_id as string | undefined
  if (!businessId) {
    const { data: pendingBusiness } = await supabaseAdmin.from('balcao_businesses').select('id').eq('created_by', user.id).eq('active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
    businessId = pendingBusiness?.id
  }

  if (!businessId) {
    const { data: business, error } = await supabaseAdmin.from('balcao_businesses').insert({ display_name: data.businessName, tax_id: taxId, phone: data.phone, pix_key: data.pixKey || null, created_by: user.id }).select('id').single()
    if (error || !business) return NextResponse.json({ error: 'Não conseguimos criar seu negócio.' }, { status: 500 })
    businessId = business.id
  }

  const { error: memberUpsertError } = await supabaseAdmin.from('balcao_business_members').upsert({ business_id: businessId, user_id: user.id, role: 'owner', active: true }, { onConflict: 'business_id,user_id' })
  if (memberUpsertError) return NextResponse.json({ error: 'Não conseguimos vincular sua conta ao negócio.' }, { status: 500 })

  const { error: businessUpdateError } = await supabaseAdmin.from('balcao_businesses').update({ display_name: data.businessName, tax_id: taxId, phone: data.phone, pix_key: data.pixKey || null, updated_at: new Date().toISOString() }).eq('id', businessId)
  if (businessUpdateError) return NextResponse.json({ error: 'Não conseguimos salvar os dados do negócio.' }, { status: 500 })

  const storeValues = {
    display_name: data.businessName,
    business_id: businessId,
    business_type: data.businessType,
    cep: data.cep,
    street: data.street,
    address_number: data.number,
    complement: data.complement || null,
    neighborhood: data.neighborhood || null,
    city: data.city,
    state: data.state,
    active: true,
    updated_at: new Date().toISOString(),
  }
  const { data: existingStore } = await supabaseAdmin.from('inventory_v1_stores').select('id').eq('business_id', businessId).order('created_at', { ascending: true }).limit(1).maybeSingle()
  let storeId = existingStore?.id as string | undefined
  if (storeId) {
    const { error } = await supabaseAdmin.from('inventory_v1_stores').update(storeValues).eq('id', storeId)
    if (error) return NextResponse.json({ error: 'Não conseguimos atualizar sua loja.' }, { status: 500 })
  } else {
    const { data: store, error } = await supabaseAdmin.from('inventory_v1_stores').insert({ ...storeValues, installation_id: randomUUID(), system_tag: 'inventory' }).select('id').single()
    if (error || !store) return NextResponse.json({ error: 'Não conseguimos criar sua loja.' }, { status: 500 })
    storeId = store.id
  }

  const { error: profileError } = await supabaseAdmin.from('balcao_profiles').upsert({ user_id: user.id, phone: data.phone, tax_id: taxId, pix_key: data.pixKey || null, referral_source: data.referralSource, referral_other: data.referralOther || null, onboarding_completed: true, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (profileError) return NextResponse.json({ error: 'A loja foi criada, mas não conseguimos concluir seu perfil. Tente novamente.' }, { status: 500 })

  try { await writeAuditEvent({ businessId, storeId, actorUserId: user.id, action: 'onboarding.completed', entityType: 'store', entityId: storeId }) } catch { /* account is already safe; do not make onboarding unusable for an audit outage */ }
  return NextResponse.json({ ok: true, businessId, storeId })
}
