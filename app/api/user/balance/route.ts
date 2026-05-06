import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]
  const admin = createAdminClient()
  const { data: { user }, error } = await admin.auth.getUser(token)

  if (error || !user) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  const { data: userData } = await admin
    .from('users')
    .select('mp_access_token')
    .eq('id', user.id)
    .single()

  if (!userData?.mp_access_token) {
    return NextResponse.json({ balance: 0, currency: 'BRL' })
  }

  try {
    const res = await fetch('https://api.mercadopago.com/v1/account/balance', {
      headers: { Authorization: `Bearer ${userData.mp_access_token}` },
    })

    if (!res.ok) {
      return NextResponse.json({ balance: 0, currency: 'BRL' })
    }

    const data = await res.json()
    return NextResponse.json({
      balance: data.available_balance || 0,
      currency: 'BRL',
    })
  } catch {
    return NextResponse.json({ balance: 0, currency: 'BRL' })
  }
}
