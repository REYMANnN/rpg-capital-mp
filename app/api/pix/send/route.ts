import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]
  const admin = createAdminClient()
  const { data: { user }, error: authError } = await admin.auth.getUser(token)

  if (authError || !user) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  if (!checkRateLimit(`pix:${user.id}`, 5, 60000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde.' }, { status: 429 })
  }

  try {
    const { pix_key, amount, pin } = await request.json()

    if (!pix_key || !amount || !pin) {
      return NextResponse.json({ error: 'Dados obrigatórios faltando' }, { status: 400 })
    }

    const { data: userData } = await admin
      .from('users')
      .select('mp_access_token, pin_hash')
      .eq('id', user.id)
      .single()

    if (!userData?.pin_hash) {
      return NextResponse.json({ error: 'PIN não configurado' }, { status: 400 })
    }

    const pinValid = await bcrypt.compare(String(pin), userData.pin_hash)
    if (!pinValid) {
      return NextResponse.json({ error: 'PIN incorreto' }, { status: 401 })
    }

    if (!userData.mp_access_token) {
      return NextResponse.json({ error: 'Conta MP não conectada' }, { status: 400 })
    }

    const idempotencyKey = `pix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userData.mp_access_token}`,
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        transaction_amount: amount,
        description: 'Transferência via RPG Capital',
        payment_method_id: 'pix',
        payer: { email: user.email },
        metadata: { pix_key },
      }),
    })

    const mpData = await mpRes.json()
    if (!mpRes.ok) {
      return NextResponse.json({ error: 'Erro ao enviar Pix' }, { status: 500 })
    }

    return NextResponse.json({ success: true, payment_id: mpData.id, status: mpData.status })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
