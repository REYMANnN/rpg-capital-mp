import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Entre com sua Conta Google para continuar.' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { storeId?: unknown }
  const storeId = typeof body.storeId === 'string' ? body.storeId : ''
  if (!storeId) return NextResponse.json({ error: 'Loja não identificada.' }, { status: 400 })

  const { error } = await supabase.rpc('balcao_complete_open_finance_onboarding', { p_store_id: storeId })
  if (error) {
    if (error.message.includes('BALCAO_OPEN_FINANCE_REQUIRED')) {
      return NextResponse.json({ error: 'Conecte pelo menos uma conta bancária para concluir o cadastro.' }, { status: 409 })
    }
    if (error.message.includes('BALCAO_OPEN_FINANCE_FORBIDDEN')) {
      return NextResponse.json({ error: 'Seu perfil não pode concluir este cadastro.' }, { status: 403 })
    }
    console.error('BALCAO Open Finance onboarding completion failed', { code: error.code })
    return NextResponse.json({ error: 'Não conseguimos concluir o cadastro agora. Tente novamente.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
