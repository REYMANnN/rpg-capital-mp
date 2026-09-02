import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { normalizeDigits, normalizePixKey, validateOnboarding } from '@/lib/accounts/validation'
import { createClient as createServerClient } from '@/lib/supabase/server'

const LEGACY_INSTALLATION_COOKIE = 'inventory_installation_id'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type OnboardingResult = {
  business_id: string
  store_id: string
  installation_id: string
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Entre com sua Conta Google para continuar.' }, { status: 401 })

  const { data: existingProfile } = await supabase.from('balcao_profiles')
    .select('onboarding_completed')
    .eq('user_id', user.id)
    .maybeSingle()
  const wasAlreadyCompleted = existingProfile?.onboarding_completed === true

  const parsed = validateOnboarding(await request.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({
      error: issue?.message ?? 'Confira os dados informados.',
      field: issue?.path?.[0] ? String(issue.path[0]) : undefined,
    }, { status: 400 })
  }

  const data = parsed.data
  const taxId = normalizeDigits(data.taxId)
  const pixKey = data.pixKey ? normalizePixKey(data.pixType, data.pixKey) : ''

  const cookieStore = await cookies()
  const currentInstallationId = cookieStore.get(LEGACY_INSTALLATION_COOKIE)?.value ?? null
  const legacyInstallationId = currentInstallationId && UUID_RE.test(currentInstallationId) ? currentInstallationId : null

  const { data: rpcData, error } = await supabase.rpc('balcao_complete_onboarding', {
    p_business_name: data.businessName,
    p_tax_id: taxId,
    p_phone: data.phone,
    p_pix_key: pixKey || null,
    p_referral_source: data.referralSource,
    p_referral_other: data.referralOther || null,
    p_business_type: data.businessType,
    p_cep: data.cep,
    p_street: data.street,
    p_address_number: data.number,
    p_complement: data.complement || null,
    p_neighborhood: data.neighborhood || null,
    p_city: data.city,
    p_state: data.state,
    p_legacy_installation_id: legacyInstallationId,
  })

  if (error) {
    if (error.message.includes('BALCAO_CNPJ_ALREADY_REGISTERED') || error.code === '23505') {
      return NextResponse.json({
        error: 'Este CNPJ já está cadastrado. Peça acesso ao responsável pelo negócio.',
        field: 'taxId',
      }, { status: 409 })
    }
    if (error.message.includes('BALCAO_MEMBER_CANNOT_ONBOARD')) {
      return NextResponse.json({ error: 'Sua conta já está vinculada a outro perfil de gestão.' }, { status: 409 })
    }
    if (error.message.includes('BALCAO_INVALID_ONBOARDING')) {
      return NextResponse.json({ error: 'Algum dado obrigatório está incompleto. Confira os campos e tente novamente.' }, { status: 400 })
    }
    console.error('BALCAO onboarding RPC failed', { code: error.code })
    return NextResponse.json({ error: 'Não conseguimos concluir seu cadastro agora. Seus dados foram mantidos; tente novamente.' }, { status: 500 })
  }

  const result = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as OnboardingResult | null
  if (!result?.business_id || !result.store_id || !result.installation_id) {
    console.error('BALCAO onboarding RPC returned incomplete result')
    return NextResponse.json({ error: 'Não conseguimos concluir seu cadastro agora. Seus dados foram mantidos; tente novamente.' }, { status: 500 })
  }

  if (!wasAlreadyCompleted) {
    const { error: pendingError } = await supabase.rpc('balcao_require_open_finance_onboarding')
    if (pendingError) {
      console.error('BALCAO onboarding Open Finance pending state failed', { code: pendingError.code })
      return NextResponse.json({ error: 'A loja foi criada, mas não conseguimos preparar a conexão bancária. Tente novamente.' }, { status: 500 })
    }
  }

  if (currentInstallationId !== result.installation_id) {
    cookieStore.set(LEGACY_INSTALLATION_COOKIE, result.installation_id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 365 * 2,
    })
  }

  return NextResponse.json({
    ok: true,
    businessId: result.business_id,
    storeId: result.store_id,
    requiresBankConnection: !wasAlreadyCompleted,
  })
}
