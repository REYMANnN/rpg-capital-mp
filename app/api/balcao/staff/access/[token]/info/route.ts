import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || token.length < 24) return NextResponse.json({ error: 'Link inválido.' }, { status: 400 })

  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('balcao_staff_access_info', { p_token: token })
  if (error) return NextResponse.json({ error: 'Não conseguimos verificar este link.' }, { status: 500 })
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.is_valid) return NextResponse.json({ error: 'Este link não está mais disponível.' }, { status: 410 })
  return NextResponse.json({ storeName: row.store_name })
}
