import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.105.3'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.2.0'

const VERCEL_TEAM_SLUG = 'renanguadalupe05-5169s-projects'
const VERCEL_PROJECT = 'rpg-capital-mp-25zw'
const VERCEL_ISSUER = `https://oidc.vercel.com/${VERCEL_TEAM_SLUG}`
const VERCEL_AUDIENCE = `https://vercel.com/${VERCEL_TEAM_SLUG}`
const VERCEL_SUBJECT = `owner:${VERCEL_TEAM_SLUG}:project:${VERCEL_PROJECT}:environment:production`
const VERCEL_JWKS = createRemoteJWKSet(new URL('https://oidc.vercel.com/.well-known/jwks'))

const POLICY_VERSION = '2026-09-16-v1'
const CONSENT_TEXT = 'Autorizo a RPG Capital a enviar avisos de estoque, resumos da loja, mensagens relacionadas à conta e atendimento por WhatsApp. Posso cancelar a qualquer momento respondendo PARAR.'
const CREATE_ACCOUNT = 'balcao_create_account'
const EXISTING_ACCOUNT = 'balcao_existing_account'
const CONSENT_YES = 'balcao_consent_yes'
const CONSENT_NO = 'balcao_consent_no'

type Incoming = {
  from: string
  messageId: string
  kind: 'text' | 'button'
  value: string
}

type Session = {
  phone: string
  state: 'welcome' | 'awaiting_store_name' | 'awaiting_consent' | 'active' | 'link_pending'
  business_id: string | null
  store_id: string | null
  pending_store_name: string | null
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function text(body: string) {
  return { type: 'text', body }
}

function buttons(body: string, items: Array<{ id: string; title: string }>) {
  return { type: 'buttons', body, buttons: items }
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function isStop(value: string) {
  return value.trim().toUpperCase() === 'PARAR'
}

async function authorizeVercel(request: Request) {
  const header = request.headers.get('authorization') || ''
  if (!header.startsWith('Bearer ')) throw new Error('missing_oidc_token')
  await jwtVerify(header.slice(7), VERCEL_JWKS, {
    issuer: VERCEL_ISSUER,
    audience: VERCEL_AUDIENCE,
    subject: VERCEL_SUBJECT,
  })
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function createSixDigitCode() {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return String(100000 + (buffer[0] % 900000))
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    await authorizeVercel(request)
  } catch (error) {
    console.error('BALCAO WhatsApp Edge OIDC rejected', error)
    return json({ error: 'Unauthorized' }, 401)
  }

  const input = await request.json().catch(() => null) as Incoming | null
  if (!input || !input.messageId || !input.from || !input.value || !['text', 'button'].includes(input.kind)) {
    return json({ error: 'Invalid payload' }, 400)
  }

  const phone = normalizePhone(input.from)
  if (phone.length < 12 || phone.length > 13) return json({ error: 'Invalid phone' }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server configuration error' }, 500)

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const [{ data: identity }, { data: currentSession }] = await Promise.all([
      supabase.from('balcao_whatsapp_identities').select('phone,business_id,store_id').eq('phone', phone).maybeSingle(),
      supabase.from('balcao_whatsapp_sessions').select('phone,state,business_id,store_id,pending_store_name').eq('phone', phone).maybeSingle(),
    ])

    let session = currentSession as Session | null
    if (!session && identity?.business_id) {
      const row = {
        phone,
        state: 'active',
        business_id: identity.business_id,
        store_id: identity.store_id ?? null,
        last_message_id: input.messageId,
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await supabase.from('balcao_whatsapp_sessions').upsert(row).select('phone,state,business_id,store_id,pending_store_name').single()
      if (error) throw error
      session = data as Session
    }

    if (input.kind === 'text' && isStop(input.value)) {
      const { error } = await supabase.rpc('balcao_whatsapp_record_event', {
        p_phone: phone,
        p_event_type: 'revoked',
        p_policy_version: POLICY_VERSION,
        p_consent_text: 'Revogação solicitada pelo usuário respondendo PARAR.',
        p_source: 'whatsapp_command',
        p_message_id: input.messageId,
        p_action_id: 'PARAR',
      })
      if (error) throw error
      return json({ ok: true, reply: text('Pronto. Você não receberá mais alertas proativos da RPG por aqui. Se quiser voltar a receber no futuro, é só autorizar novamente.') })
    }

    if (input.kind === 'button' && input.value === CREATE_ACCOUNT) {
      if (identity?.business_id) {
        return json({ ok: true, reply: text('Este WhatsApp já está vinculado a uma loja no BALCÃO. Você pode continuar usando este número normalmente.') })
      }
      const { error } = await supabase.from('balcao_whatsapp_sessions').upsert({
        phone,
        state: 'awaiting_store_name',
        last_message_id: input.messageId,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
      return json({ ok: true, reply: text('Qual o nome da sua loja?') })
    }

    if (input.kind === 'button' && input.value === EXISTING_ACCOUNT) {
      const code = createSixDigitCode()
      const codeHash = await sha256(code)
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

      await supabase.from('balcao_whatsapp_link_codes')
        .delete()
        .eq('phone', phone)
        .is('consumed_at', null)

      const { error: codeError } = await supabase.from('balcao_whatsapp_link_codes').insert({
        phone,
        code_hash: codeHash,
        expires_at: expiresAt,
      })
      if (codeError) throw codeError

      const { error: sessionError } = await supabase.from('balcao_whatsapp_sessions').upsert({
        phone,
        state: 'link_pending',
        last_message_id: input.messageId,
        updated_at: new Date().toISOString(),
      })
      if (sessionError) throw sessionError

      return json({
        ok: true,
        reply: text(`Para ligar este WhatsApp à sua conta existente, entre no BALCÃO e confirme o código ${code}. Ele vale por 15 minutos: https://www.rpgcapital.com.br/vincular-whatsapp?code=${code}`),
      })
    }

    if (session?.state === 'awaiting_store_name' && input.kind === 'text') {
      const storeName = input.value.trim()
      if (storeName.length < 2) return json({ ok: true, reply: text('Me diga o nome da sua loja com pelo menos 2 caracteres.') })

      const { error } = await supabase.rpc('balcao_whatsapp_create_business', {
        p_phone: phone,
        p_store_name: storeName,
        p_message_id: input.messageId,
      })
      if (error) throw error

      return json({
        ok: true,
        reply: buttons('Posso te mandar avisos de estoque baixo e o resumo do dia por aqui?', [
          { id: CONSENT_YES, title: 'Sim, pode mandar' },
          { id: CONSENT_NO, title: 'Agora não' },
        ]),
      })
    }

    if (session?.state === 'awaiting_consent' && input.kind === 'button' && input.value === CONSENT_YES) {
      const { error } = await supabase.rpc('balcao_whatsapp_record_event', {
        p_phone: phone,
        p_event_type: 'granted',
        p_policy_version: POLICY_VERSION,
        p_consent_text: CONSENT_TEXT,
        p_source: 'whatsapp_onboarding',
        p_message_id: input.messageId,
        p_action_id: CONSENT_YES,
      })
      if (error) throw error
      const storeName = session.pending_store_name || 'sua loja'
      return json({ ok: true, reply: text(`Pronto, ${storeName} está criada. Pode mandar a foto de uma nota que chegou e eu cadastro os produtos com o custo. Para parar os alertas, responda PARAR.`) })
    }

    if (session?.state === 'awaiting_consent' && input.kind === 'button' && input.value === CONSENT_NO) {
      const { error } = await supabase.from('balcao_whatsapp_sessions').update({
        state: 'active',
        last_message_id: input.messageId,
        updated_at: new Date().toISOString(),
      }).eq('phone', phone)
      if (error) throw error
      const storeName = session.pending_store_name || 'sua loja'
      return json({ ok: true, reply: text(`Pronto, ${storeName} está criada. Não vou mandar alertas proativos. Você pode falar comigo por aqui quando quiser.`) })
    }

    if (session?.state === 'link_pending') {
      return json({ ok: true, reply: text('O vínculo com sua conta existente ainda está pendente. Abra o link que enviei e confirme o código dentro do BALCÃO.') })
    }

    if (session?.state === 'active' || identity?.business_id) {
      return json({ ok: true, reply: text('Seu WhatsApp já está ligado ao BALCÃO. Posso receber comandos da sua loja por aqui.') })
    }

    return json({
      ok: true,
      reply: buttons('Olá! Sou a RPG Capital. Organizo estoque, vendas e lucro da sua loja aqui no WhatsApp.', [
        { id: CREATE_ACCOUNT, title: 'Criar minha conta' },
        { id: EXISTING_ACCOUNT, title: 'Já tenho conta' },
      ]),
    })
  } catch (error) {
    console.error('BALCAO WhatsApp Edge processing failed', error)
    return json({ error: 'WhatsApp processing failed' }, 500)
  }
})
