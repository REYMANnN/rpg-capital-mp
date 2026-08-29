import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { STAFF_SESSION_COOKIE, unpackCredential } from '@/lib/accounts/terminal'
export async function POST(request: NextRequest) { const packed = unpackCredential(request.cookies.get(STAFF_SESSION_COOKIE)?.value); if (packed) { const admin = createAdminClient(); await admin.from('balcao_staff_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', packed.id) } const response = NextResponse.json({ ok: true }); response.cookies.delete(STAFF_SESSION_COOKIE); return response }
