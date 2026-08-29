import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateStaffSession, validateTerminalCredential } from '@/lib/accounts/requestContext'
import { STAFF_SESSION_COOKIE, TERMINAL_COOKIE } from '@/lib/accounts/terminal'

export async function GET(request: NextRequest) {
  const terminal = await validateTerminalCredential(request.cookies.get(TERMINAL_COOKIE)?.value)
  if (!terminal) return NextResponse.json({ error: 'Este dispositivo não está autorizado.', authorized: false }, { status: 401 })
  const admin = createAdminClient(); const { data: accesses } = await admin.from('balcao_staff_store_access').select('staff_id, role, active').eq('store_id', terminal.storeId).eq('active', true)
  const ids = (accesses ?? []).map((x) => x.staff_id); const { data: people } = ids.length ? await admin.from('balcao_staff_profiles').select('id, display_name, active').in('id', ids).eq('active', true) : { data: [] as any[] }
  const staff = (accesses ?? []).map((access) => { const person = (people ?? []).find((p) => p.id === access.staff_id); return person ? { id: person.id, displayName: person.display_name, role: access.role } : null }).filter(Boolean)
  const current = await validateStaffSession(terminal, request.cookies.get(STAFF_SESSION_COOKIE)?.value)
  return NextResponse.json({ authorized: true, store: { id: terminal.storeId, displayName: terminal.storeName }, terminal: { id: terminal.terminalId, displayName: terminal.terminalName }, staff, currentStaff: current ? { id: current.staffId, displayName: current.staffName, role: current.role } : null })
}
