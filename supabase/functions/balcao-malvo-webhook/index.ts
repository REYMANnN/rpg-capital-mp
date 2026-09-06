import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.105.3'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.2.0'

const VERCEL_TEAM_SLUG = 'renanguadalupe05-5169s-projects'
const VERCEL_PROJECT = 'rpg-capital-mp-25zw'
const VERCEL_ISSUER = `https://oidc.vercel.com/${VERCEL_TEAM_SLUG}`
const VERCEL_AUDIENCE = `https://vercel.com/${VERCEL_TEAM_SLUG}`
const VERCEL_SUBJECT = `owner:${VERCEL_TEAM_SLUG}:project:${VERCEL_PROJECT}:environment:production`
const VERCEL_JWKS = createRemoteJWKSet(new URL('https://oidc.vercel.com/.well-known/jwks'))

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

async function authorizeVercel(request: Request) {
  const header = request.headers.get('authorization') || ''
  if (!header.startsWith('Bearer ')) throw new Error('missing_oidc_token')
  const token = header.slice(7)
  await jwtVerify(token, VERCEL_JWKS, {
    issuer: VERCEL_ISSUER,
    audience: VERCEL_AUDIENCE,
    subject: VERCEL_SUBJECT,
  })
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    await authorizeVercel(request)
  } catch (error) {
    console.error('BALCAO Malvo Edge OIDC rejected', error)
    return json({ error: 'Unauthorized' }, 401)
  }

  const input = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!input || typeof input.p_event_id !== 'string' || typeof input.p_event_type !== 'string') {
    return json({ error: 'Invalid payload' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('BALCAO Malvo Edge missing Supabase runtime credentials')
    return json({ error: 'Server configuration error' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase.rpc('balcao_process_malvo_webhook', input)
  if (error) {
    console.error('BALCAO Malvo Edge RPC failed', error)
    return json({ error: 'Webhook persistence failed' }, 500)
  }

  const result = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  if (result.ok === false) {
    console.error('BALCAO Malvo Edge RPC requested retry', result.error || 'unknown_error')
    return json({ error: 'Webhook processing failed' }, 500)
  }

  return json({
    ok: true,
    duplicate: result.duplicate === true,
    ignored: result.ignored === true,
  })
})
