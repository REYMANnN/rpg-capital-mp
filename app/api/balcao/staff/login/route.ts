import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseStaffLogin } from '@/lib/accounts/payloads'
import { verifyPin } from '@/lib/accounts/pin'
import { nextPinLock } from '@/lib/accounts/access'
import { validateTerminalCredential } from '@/lib/accounts/requestContext'
import { hashSecret, makeSecret, packCredential, STAFF_SESSION_COOKIE, STAFF_SESSION_MAX_MS, TERMINAL_COOKIE } from '@/lib/accounts/terminal'
import { writeAuditEvent } from '@/lib/accounts/audit'

export async function POST(request: NextRequest) {
  const terminal = await validateTerminalCredential(request.cookies.get(TERMINAL_COOKIE)?.value); if (!terminal) return NextResponse.json({ error: 'Este dispositivo não está autorizado.' }, { status: 401 })
  const parsed = parseStaffLogin(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: 'Digite seu PIN de 4 números.' }, { status: 400 })
  const admin = createAdminClient(); const [{ data: staff }, { data: access }] = await Promise.all([
    admin.from('balcao_staff_profiles').select('id, display_name, pin_hash, active, failed_pin_attempts, locked_until').eq('id', parsed.data.staffId).eq('business_id', terminal.businessId).maybeSingle(),
    admin.from('balcao_staff_store_access').select('role, active').eq('staff_id', parsed.data.staffId).eq('store_id', terminal.storeId).maybeSingle(),
  ])
  if (!staff?.active || !access?.active) return NextResponse.json({ error: 'Este perfil não tem acesso a esta loja.' }, { status: 403 })
  const now = Date.now(); if (staff.locked_until && new Date(staff.locked_until).getTime() > now) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco e tente novamente.' }, { status: 429 })
  const valid = await verifyPin(parsed.data.pin, staff.pin_hash)
  if (!valid) {
    const attempts = Number(staff.failed_pin_attempts || 0) + 1; const lock = nextPinLock(attempts, now)
    await admin.from('balcao_staff_profiles').update({ failed_pin_attempts: attempts, locked_until: lock ? new Date(lock.lockedUntil).toISOString() : null }).eq('id', staff.id)
    return NextResponse.json({ error: lock ? 'Muitas tentativas. Aguarde um pouco e tente novamente.' : 'PIN incorreto.' }, { status: lock ? 429 : 401 })
  }
  await admin.from('balcao_staff_profiles').update({ failed_pin_attempts: 0, locked_until: null }).eq('id', staff.id)
  await admin.from('balcao_staff_sessions').update({ revoked_at: new Date().toISOString() }).eq('terminal_id', terminal.terminalId).is('revoked_at', null)
  const secret = makeSecret(); const expiresAt = new Date(now + STAFF_SESSION_MAX_MS).toISOString(); const { data: session, error } = await admin.from('balcao_staff_sessions').insert({ terminal_id: terminal.terminalId, staff_id: staff.id, session_hash: hashSecret(secret), expires_at: expiresAt }).select('id').single()
  if (error || !session) return NextResponse.json({ error: 'Não conseguimos iniciar o acesso.' }, { status: 500 })
  const response = NextResponse.json({ ok: true, staff: { id: staff.id, displayName: staff.display_name, role: access.role } }); response.cookies.set(STAFF_SESSION_COOKIE, packCredential(session.id, secret), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: STAFF_SESSION_MAX_MS / 1000 })
  await writeAuditEvent({ businessId: terminal.businessId, storeId: terminal.storeId, actorStaffId: staff.id, terminalId: terminal.terminalId, action: 'staff.login', entityType: 'staff', entityId: staff.id }).catch(() => {})
  return response
}
