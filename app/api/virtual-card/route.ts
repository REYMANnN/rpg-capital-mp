import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateToken } from '@/lib/utils'

export async function POST(request: NextRequest) {
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

  const qrToken = generateToken()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  const { data, error: insertError } = await admin
    .from('virtual_cards')
    .upsert({
      user_id: user.id,
      qr_token: qrToken,
      qr_expires_at: expiresAt,
    }, { onConflict: 'user_id' })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ qr_token: qrToken, expires_at: expiresAt })
}
