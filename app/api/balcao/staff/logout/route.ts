import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { hashSecret, STAFF_SESSION_COOKIE, unpackCredential } from '@/lib/accounts/terminal'

export async function POST(request: NextRequest) {
  const packed = unpackCredential(request.cookies.get(STAFF_SESSION_COOKIE)?.value)
  if (packed) {
    const supabase = await createServerClient()
    await supabase.rpc('balcao_staff_session_logout', {
      p_session_id: packed.id,
      p_session_hash: hashSecret(packed.secret),
    })
  }
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(STAFF_SESSION_COOKIE)
  return response
}
