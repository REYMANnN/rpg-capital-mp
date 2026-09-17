import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { WHATSAPP_CONSENT_QUESTION } from '@/lib/legal/whatsappConsent'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { sendWhatsAppButtons } from '@/lib/whatsapp/cloud'
import { WHATSAPP_BUTTON_IDS } from '@/lib/whatsapp/inbound'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function isForm(request: Request) {
  return request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')
    || request.headers.get('content-type')?.includes('multipart/form-data')
}

async function body(request: Request) {
  if (isForm(request)) {
    const form = await request.formData()
    return {
      token: String(form.get('token') || ''),
      businessId: String(form.get('businessId') || ''),
    }
  }
  const json = await request.json().catch(() => ({})) as Record<string, unknown>
  return {
    token: typeof json.token === 'string' ? json.token : '',
    businessId: typeof json.businessId === 'string' ? json.businessId : '',
  }
}

function redirectResult(request: Request, status: 'ok' | 'erro', detail?: string) {
  const url = new URL('/whatsapp/vincular', request.url)
  url.searchParams.set(status === 'ok' ? 'vinculado' : 'erro', detail || '1')
  return NextResponse.redirect(url, { status: 303 })
}

export async function POST(request: Request) {
  const formRequest = isForm(request)
  const supabase = await createServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return formRequest
      ? redirectResult(request, 'erro', 'login')
      : NextResponse.json({ error: 'Faça login para confirmar este WhatsApp.' }, { status: 401 })
  }

  const { token, businessId } = await body(request)
  if (!token || token.length < 20 || !businessId) {
    return formRequest
      ? redirectResult(request, 'erro', 'link-invalido')
      : NextResponse.json({ error: 'Link ou negócio inválido.' }, { status: 400 })
  }

  const { data: membership, error: membershipError } = await supabase
    .from('balcao_business_members')
    .select('role,active')
    .eq('business_id', businessId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError || !membership?.active || !['owner', 'admin'].includes(membership.role)) {
    return formRequest
      ? redirectResult(request, 'erro', 'sem-permissao')
      : NextResponse.json({ error: 'Somente owner ou admin pode vincular este WhatsApp.' }, { status: 403 })
  }

  const { data: waId, error } = await supabase.rpc('balcao_whatsapp_link_business', {
    p_token_hash: hashToken(token),
    p_business_id: businessId,
  })

  if (error || typeof waId !== 'string' || !waId) {
    const detail = error?.message?.includes('BALCAO_WHATSAPP_LINK_INVALID') ? 'expirado' : 'falha'
    return formRequest
      ? redirectResult(request, 'erro', detail)
      : NextResponse.json({ error: detail === 'expirado' ? 'Este link expirou ou já foi usado.' : 'Não foi possível vincular o WhatsApp.' }, { status: 409 })
  }

  try {
    await sendWhatsAppButtons(waId, WHATSAPP_CONSENT_QUESTION, [
      { id: WHATSAPP_BUTTON_IDS.consentYes, title: 'Sim, pode mandar' },
      { id: WHATSAPP_BUTTON_IDS.consentNo, title: 'Agora não' },
    ])
  } catch (sendError) {
    console.error('BALCAO linked WhatsApp but could not send consent prompt', {
      message: sendError instanceof Error ? sendError.message : 'unknown',
    })
  }

  return formRequest
    ? redirectResult(request, 'ok')
    : NextResponse.json({ ok: true, waId })
}
