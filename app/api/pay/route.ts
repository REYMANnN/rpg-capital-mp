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

  // Terminal calls use 'Bearer terminal' — look up payer from QR token instead
  const isTerminalCall = token === 'terminal'
  let userId: string | null = null

  if (!isTerminalCall) {
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }
    userId = user.id
  }

  const rateLimitKey = userId || request.headers.get('x-forwarded-for') || 'anon'
  if (!checkRateLimit(`pay:${rateLimitKey}`, 10, 60000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um momento.' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const { qr_token, merchant_id, terminal_id, amount, items, pin } = body

    if (!qr_token || !merchant_id || !amount || !pin) {
      return NextResponse.json({ error: 'Dados obrigatórios faltando' }, { status: 400 })
    }

    // Validate QR token first to get payer
    const { data: cardData, error: cardError } = await admin
      .from('virtual_cards')
      .select('*')
      .eq('qr_token', qr_token)
      .single()

    if (cardError || !cardData) {
      return NextResponse.json({ error: 'QR Code inválido' }, { status: 400 })
    }

    if (new Date(cardData.qr_expires_at) < new Date()) {
      return NextResponse.json({ error: 'QR Code expirado' }, { status: 400 })
    }

    // Load payer data using user_id from the card
    const { data: payerData, error: payerError } = await admin
      .from('users')
      .select('id, mp_access_token, mp_user_id, pin_hash, account_type, email')
      .eq('id', cardData.user_id)
      .single()

    if (payerError || !payerData) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    if (!payerData.pin_hash) {
      return NextResponse.json({ error: 'PIN não configurado' }, { status: 400 })
    }

    const pinValid = await bcrypt.compare(String(pin), payerData.pin_hash)
    if (!pinValid) {
      return NextResponse.json({ error: 'PIN incorreto' }, { status: 401 })
    }

    // Get merchant data
    const { data: merchantData, error: merchantError } = await admin
      .from('merchants')
      .select('*, users!merchants_user_id_fkey(mp_user_id, account_type)')
      .eq('id', merchant_id)
      .single()

    if (merchantError || !merchantData) {
      return NextResponse.json({ error: 'Lojista não encontrado' }, { status: 404 })
    }

    // Calculate fee (0% internal, 1% external)
    const merchantUserData = (merchantData as any).users
    const isInternal = merchantUserData?.account_type === 'pj'
    const rpgFee = isInternal ? 0 : Math.round(amount * 0.01 * 100) / 100
    const netAmount = amount - rpgFee

    if (!payerData.mp_access_token) {
      return NextResponse.json({ error: 'Conta Mercado Pago não conectada' }, { status: 400 })
    }

    const merchantMpUserId = merchantUserData?.mp_user_id
    if (!merchantMpUserId) {
      return NextResponse.json({ error: 'Lojista sem conta Mercado Pago' }, { status: 400 })
    }

    const idempotencyKey = `rpg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const mpPaymentRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${payerData.mp_access_token}`,
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        transaction_amount: amount,
        description: `Pagamento RPG Capital - ${merchantData.business_name}`,
        payment_method_id: 'pix',
        payer: { email: payerData.email },
        application_fee: rpgFee,
        collector_id: merchantMpUserId,
      }),
    })

    const mpPayment = await mpPaymentRes.json()

    if (!mpPaymentRes.ok || mpPayment.error) {
      console.error('MP payment error:', mpPayment)
      return NextResponse.json({ error: 'Erro ao processar pagamento' }, { status: 500 })
    }

    // Map MP status to DB status
    const dbStatus = mpPayment.status === 'approved' ? 'completed' : 'pending'

    // Create transaction record
    const { data: txData, error: txError } = await admin
      .from('transactions')
      .insert({
        payer_user_id: cardData.user_id,
        merchant_id,
        terminal_id: terminal_id || null,
        amount,
        rpg_fee: rpgFee,
        net_amount: netAmount,
        status: dbStatus,
        mp_payment_id: String(mpPayment.id),
      })
      .select()
      .single()

    if (txError) {
      console.error('Transaction insert error:', txError)
    }

    // Create transaction items and update stock
    if (items && Array.isArray(items) && txData) {
      for (const item of items) {
        await admin.from('transaction_items').insert({
          transaction_id: txData.id,
          product_id: item.product_id || null,
          description: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.quantity * item.unit_price,
        })

        if (item.product_id) {
          await admin.rpc('decrement_stock', {
            p_product_id: item.product_id,
            p_quantity: item.quantity,
          })
        }
      }
    }

    // Invalidate QR token after use
    await admin
      .from('virtual_cards')
      .update({ qr_expires_at: new Date(0).toISOString() })
      .eq('qr_token', qr_token)

    // Log terminal event
    if (terminal_id && txData) {
      await admin.from('terminal_audit_log').insert({
        terminal_id,
        merchant_id,
        event_type: 'transaction',
        metadata: { transaction_id: txData.id, amount },
      })
    }

    return NextResponse.json({
      success: true,
      transaction_id: txData?.id,
      status: mpPayment.status,
      amount,
      receipt: {
        merchant: merchantData.business_name,
        amount,
        fee: rpgFee,
        net: netAmount,
        timestamp: new Date().toISOString(),
      }
    })
  } catch (err: any) {
    console.error('Pay error:', err)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
