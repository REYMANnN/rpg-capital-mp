import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/accounts/currentUser'
import { createClient as createServerClient } from '@/lib/supabase/server'

const schema = z.object({
  storeId: z.string().uuid(),
  displayName: z.string().trim().min(2).max(80).optional(),
  role: z.enum(['stock', 'cashier', 'manager', 'custom']).optional(),
  customPermissions: z.array(z.string()).max(30).optional(),
  active: z.boolean().optional(),
})

function mapRpcError(message: string) {
  if (message.includes('BALCAO_STAFF_FORBIDDEN')) return { status: 403, error: 'Sem permissão.' }
  if (message.includes('BALCAO_STAFF_NOT_FOUND')) return { status: 404, error: 'Funcionário não encontrado.' }
  if (message.includes('BALCAO_STORE_NOT_FOUND')) return { status: 404, error: 'Loja não encontrada.' }
  if (message.includes('BALCAO_INVALID_STAFF')) return { status: 400, error: 'Confira os dados do funcionário.' }
  if (message.includes('BALCAO_NOT_AUTHENTICATED')) return { status: 401, error: 'Não autenticado.' }
  return { status: 500, error: 'Não conseguimos atualizar o funcionário.' }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Confira os dados do funcionário.' }, { status: 400 })

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Funcionário inválido.' }, { status: 400 })
  }

  const input = parsed.data
  const supabase = await createServerClient()
  const { error } = await supabase.rpc('balcao_update_staff', {
    p_store_id: input.storeId,
    p_staff_id: id,
    p_display_name: input.displayName ?? null,
    p_role: input.role ?? null,
    p_custom_permissions: input.customPermissions ?? null,
    p_active: input.active ?? null,
  })

  if (error) {
    const mapped = mapRpcError(error.message)
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  return NextResponse.json({ ok: true })
}
