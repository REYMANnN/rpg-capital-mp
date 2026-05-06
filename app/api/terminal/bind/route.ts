import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const { device_id, merchant_code, terminal_name } = await request.json()

    if (!device_id || !merchant_code) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: merchants, error: merchantError } = await admin
      .from('merchants')
      .select('id, business_name, admin_password_hash')
      .limit(100)

    if (merchantError || !merchants) {
      return NextResponse.json({ error: 'Erro ao buscar lojistas' }, { status: 500 })
    }

    let foundMerchant = null
    for (const m of merchants) {
      if (m.admin_password_hash) {
        const match = await bcrypt.compare(merchant_code, m.admin_password_hash)
        if (match) {
          foundMerchant = m
          break
        }
      }
    }

    if (!foundMerchant) {
      return NextResponse.json({ error: 'Código de lojista inválido' }, { status: 401 })
    }

    // Upsert terminal
    const { data: terminalData } = await admin
      .from('terminals')
      .upsert({
        device_id,
        merchant_id: foundMerchant.id,
        name: terminal_name || 'Terminal',
        status: 'online',
        last_heartbeat_at: new Date().toISOString(),
      }, { onConflict: 'device_id' })
      .select('id')
      .single()

    // Log the connection event (event_type must be one of the constrained values)
    await admin.from('terminal_audit_log').insert({
      terminal_id: terminalData?.id || null,
      merchant_id: foundMerchant.id,
      event_type: 'connected',
      metadata: { device_id },
    })

    return NextResponse.json({
      success: true,
      terminal_id: terminalData?.id || null,
      merchant: {
        id: foundMerchant.id,
        business_name: foundMerchant.business_name,
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
