import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/accounts/currentUser'
import { createClient as createServerClient } from '@/lib/supabase/server'

const bodySchema = z.object({ storeId: z.string().uuid() })

function mapError(message: string) {
  if (message.includes('BALCAO_STAFF_FORBIDDEN')) return { status: 403, error: 'Sem permissão para gerenciar esta loja.' }
  if (message.includes('BALCAO_STAFF_NOT_FOUND')) return { status: 404, error: 'Funcionário não encontrado.' }
  if (message.includes('BALCAO_STORE_NOT_FOUND')) return { status: 404, error: 'Loja não encontrada.' }
  return { status: 500, error: 'Não conseguimos gerar um novo link.' }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const input = bodySchema.safeParse(await request.json().catch(() => null))
  const { id } = await params
  if (!input.success || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Confira o funcionário e a loja.' }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('balcao_rotate_staff_access_link', {
    p_store_id: input.data.storeId,
    p_staff_id: id,
  })
  if (error || typeof data !== 'string') {
    const mapped = mapError(error?.message ?? '')
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  const origin = new URL(request.url).origin
  return NextResponse.json({ accessUrl: `${origin}/acesso/${encodeURIComponent(data)}` })
}
