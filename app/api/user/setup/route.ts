import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, name, email, cpf, account_type, pin, business_name, cnpj, admin_password } = body

    if (!userId || !name || !email || !cpf || !pin) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
    }

    const admin = createAdminClient()
    const pinHash = await bcrypt.hash(pin, 12)

    const { error: userError } = await admin
      .from('users')
      .upsert({
        id: userId,
        email,
        name,
        cpf,
        account_type,
        pin_hash: pinHash,
      })

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 500 })
    }

    if (account_type === 'pj' && business_name && cnpj) {
      const adminPasswordHash = admin_password ? await bcrypt.hash(admin_password, 12) : null
      const { error: merchantError } = await admin
        .from('merchants')
        .insert({
          user_id: userId,
          business_name,
          cnpj,
          admin_password_hash: adminPasswordHash,
          nfe_auto_emit: false,
        })

      if (merchantError) {
        return NextResponse.json({ error: merchantError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
