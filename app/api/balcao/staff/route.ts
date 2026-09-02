import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/accounts/currentUser'
import { parseStaffCreate } from '@/lib/accounts/payloads'
import { hashPin } from '@/lib/accounts/pin'
import { createClient as createServerClient } from '@/lib/supabase/server'

const storeIdSchema = z.string().uuid()

function staffRpcError(message: string) {
  if (message.includes('BALCAO_STAFF_FORBIDDEN')) return { status: 403, error: 'Sem permissão para gerenciar esta loja.' }
  if (message.includes('BALCAO_STORE_NOT_FOUND')) return { status: 404, error: 'Loja não encontrada.' }
  if (message.includes('BALCAO_STAFF_NOT_FOUND')) return { status: 404, error: 'Funcionário não encontrado.' }
  if (message.includes('BALCAO_INVALID_STAFF')) return { status: 400, error: 'Confira os dados do funcionário.' }
  if (message.includes('BALCAO_NOT_AUTHENTICATED')) return { status: 401, error: 'Entre com Google para continuar.' }
  return { status: 500, error: 'Não conseguimos concluir esta ação. Tente novamente.' }
}

function accessUrl(request: Request, token: string | null | undefined) {
  if (!token) return null
  return `${new URL(request.url).origin}/acesso/${encodeURIComponent(token)}`
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const storeId = new URL(request.url).searchParams.get('storeId') ?? ''
  if (!storeIdSchema.safeParse(storeId).success) {
    return NextResponse.json({ error: 'Loja inválida.' }, { status: 400 })
  }

  const supabase = await createServerClient()
  const [{ data, error }, { data: links, error: linksError }] = await Promise.all([
    supabase.rpc('balcao_list_staff', { p_store_id: storeId }),
    supabase.rpc('balcao_staff_access_links_for_store', { p_store_id: storeId }),
  ])
  const rpcError = error ?? linksError
  if (rpcError) {
    const mapped = staffRpcError(rpcError.message)
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  const staff = (data ?? []).map((item: any) => {
    const link = (links ?? []).find((candidate: any) => candidate.staff_id === item.staff_id)
    return {
      id: item.staff_id,
      displayName: item.display_name,
      role: item.staff_role,
      customPermissions: Array.isArray(item.custom_permissions) ? item.custom_permissions : [],
      active: Boolean(item.is_active),
      googleLinked: Boolean(item.google_linked),
      accessUrl: accessUrl(request, link?.access_token),
    }
  })

  return NextResponse.json({ staff })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Entre com Google para continuar.' }, { status: 401 })

  const parsed = parseStaffCreate(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Confira os dados.' }, { status: 400 })
  }

  const input = parsed.data
  const pinHash = await hashPin(input.pin)
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('balcao_create_staff', {
    p_store_id: input.storeId,
    p_display_name: input.displayName,
    p_role: input.role,
    p_pin_hash: pinHash,
    p_custom_permissions: input.customPermissions,
  })

  if (error) {
    const mapped = staffRpcError(error.message)
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  const person = Array.isArray(data) ? data[0] : data
  if (!person?.staff_id) {
    return NextResponse.json({ error: 'Não conseguimos criar o funcionário.' }, { status: 500 })
  }

  const { data: links } = await supabase.rpc('balcao_staff_access_links_for_store', { p_store_id: input.storeId })
  const link = (links ?? []).find((candidate: any) => candidate.staff_id === person.staff_id)

  return NextResponse.json({
    staff: {
      id: person.staff_id,
      displayName: person.display_name,
      role: person.staff_role,
      customPermissions: input.role === 'custom' ? input.customPermissions : [],
      active: Boolean(person.is_active),
      accessUrl: accessUrl(request, link?.access_token),
    },
  }, { status: 201 })
}
