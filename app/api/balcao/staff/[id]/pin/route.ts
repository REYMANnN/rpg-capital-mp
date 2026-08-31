import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/accounts/currentUser'
import { hashPin } from '@/lib/accounts/pin'
import { createClient as createServerClient } from '@/lib/supabase/server'

const schema = z.object({ storeId: z.string().uuid(), pin: z.string().regex(/^\d{4}$/) })

function mapRpcError(message: string) {
  if (message.includes('BALCAO_STAFF_FORBIDDEN')) return { status: 403, error: 'Sem permissão.' }
  if (message.includes('BALCAO_STAFF_NOT_FOUND')) return { status: 404, error: 'Funcionário não encontrado.' }
  if (message.includes('BALCAO_STORE_NOT_FOUND')) return { status: 404, error: 'Loja não encontrada.' }
  if (message.includes('BALCAO_INVALID_STAFF_PIN')) return { status: 400, error: 'O novo PIN deve ter 4 números.' }
  if (message.includes('BALCAO_NOT_AUTHENTICATED')) return { status: 401, error: 'Não autenticado.' }
  return { status: 500, error: 'Não conseguimos redefinir o PIN.' }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'O novo PIN deve ter 4 números.' }, { status: 400 })

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Funcionário inválido.' }, { status: 400 })
  }

  const pinHash = await hashPin(parsed.data.pin)
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('balcao_reset_staff_pin', {
    p_store_id: parsed.data.storeId,
    p_staff_id: id,
    p_pin_hash: pinHash,
  })

  if (error) {
    const mapped = mapRpcError(error.message)
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  return NextResponse.json({ ok: true })
}
