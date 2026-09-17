import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

function redirect(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), { status: 303 })
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return redirect(request, '/login?intent=login')

  const form = await request.formData().catch(() => null)
  const code = String(form?.get('code') ?? '').replace(/\D/g, '')
  const businessId = String(form?.get('businessId') ?? '')

  if (!/^\d{6}$/.test(code) || !/^[0-9a-f-]{36}$/i.test(businessId)) {
    return redirect(request, '/vincular-whatsapp?erro=codigo')
  }

  const codeHash = createHash('sha256').update(code).digest('hex')
  const { data, error } = await supabase.rpc('balcao_confirm_whatsapp_link', {
    p_business_id: businessId,
    p_code_hash: codeHash,
  })

  if (error || !data || (typeof data === 'object' && 'ok' in data && data.ok !== true)) {
    const expired = error?.message?.includes('BALCAO_WHATSAPP_LINK_INVALID_OR_EXPIRED')
    return redirect(request, `/vincular-whatsapp?erro=${expired ? 'expirado' : 'conta'}`)
  }

  return redirect(request, '/manage?whatsapp=linked')
}
