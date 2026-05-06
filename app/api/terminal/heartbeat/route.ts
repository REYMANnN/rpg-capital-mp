import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const { device_id } = await request.json()
    if (!device_id) {
      return NextResponse.json({ error: 'device_id obrigatório' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('terminals')
      .update({
        status: 'online',
        last_heartbeat_at: new Date().toISOString(),
      })
      .eq('device_id', device_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
