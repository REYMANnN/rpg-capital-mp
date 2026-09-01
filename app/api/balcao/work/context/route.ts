import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { hashSecret, STAFF_SESSION_COOKIE, TERMINAL_COOKIE, unpackCredential } from '@/lib/accounts/terminal'

export async function GET(request: NextRequest) {
  const terminal = unpackCredential(request.cookies.get(TERMINAL_COOKIE)?.value)
  if (!terminal) return NextResponse.json({ error: 'Este dispositivo não está autorizado.', authorized: false }, { status: 401 })

  const session = unpackCredential(request.cookies.get(STAFF_SESSION_COOKIE)?.value)
  const supabase = await createServerClient()
  const { data: contextData, error: contextError } = await supabase.rpc('balcao_operational_context', {
    p_terminal_id: terminal.id,
    p_terminal_hash: hashSecret(terminal.secret),
    p_session_id: session?.id ?? null,
    p_session_hash: session ? hashSecret(session.secret) : null,
  })

  if (contextError) return NextResponse.json({ error: 'Não conseguimos carregar este acesso.', authorized: false }, { status: 500 })
  const context = Array.isArray(contextData) ? contextData[0] : contextData
  if (!context?.terminal_id) return NextResponse.json({ error: 'Este dispositivo não está autorizado.', authorized: false }, { status: 401 })

  const { data: staffData } = await supabase.rpc('balcao_operational_staff_list', {
    p_terminal_id: terminal.id,
    p_terminal_hash: hashSecret(terminal.secret),
  })

  const staff = (staffData ?? []).map((person: any) => ({
    id: person.staff_id,
    displayName: person.display_name,
    role: person.staff_role,
  }))
  const currentStaff = context.current_staff_id ? {
    id: context.current_staff_id,
    displayName: context.current_staff_name,
    role: context.current_staff_role,
    customPermissions: Array.isArray(context.current_custom_permissions) ? context.current_custom_permissions : [],
  } : null

  return NextResponse.json({
    authorized: true,
    store: { id: context.store_id, displayName: context.store_name },
    terminal: { id: context.terminal_id, displayName: context.terminal_name },
    staff,
    currentStaff,
  })
}
