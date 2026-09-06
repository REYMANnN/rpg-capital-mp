import { getSupabaseUrl } from '@/lib/supabase/config'

const EDGE_FUNCTION = 'balcao-malvo-ingest'

function requiredEnv(name: 'MALVO_CLIENT_ID' | 'MALVO_CLIENT_SECRET' | 'MALVO_WEBHOOK_SECRET') {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function vercelOidcToken(request: Request) {
  return request.headers.get('x-vercel-oidc-token')?.trim()
    || process.env.VERCEL_OIDC_TOKEN?.trim()
    || ''
}

export function getMalvoEdgeWebhookUrl() {
  return `${getSupabaseUrl()}/functions/v1/${EDGE_FUNCTION}`
}

async function edgeCall(request: Request, body: Record<string, unknown>) {
  const token = vercelOidcToken(request)
  if (!token) throw new Error('Vercel OIDC token is not available')
  return fetch(getMalvoEdgeWebhookUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
}

async function edgeError(response: Response) {
  const payload = await response.json().catch(() => ({})) as { error?: string; code?: string }
  const error = new Error(payload.error || `Malvo Edge runtime failed (${response.status})`) as Error & { status?: number; code?: string }
  error.status = response.status
  error.code = payload.code
  return error
}

export async function bootstrapMalvoEdgeRuntime(request: Request) {
  const response = await edgeCall(request, {
    action: 'bootstrap',
    clientId: requiredEnv('MALVO_CLIENT_ID'),
    clientSecret: requiredEnv('MALVO_CLIENT_SECRET'),
    webhookSecret: requiredEnv('MALVO_WEBHOOK_SECRET'),
    webhookEgressIp: process.env.MALVO_WEBHOOK_EGRESS_IP?.trim() || null,
  })
  if (!response.ok) throw await edgeError(response)
  return response.json() as Promise<{ ok: true; webhookUrl: string }>
}

export async function forwardMalvoWebhookToEdge(request: Request, payload: Record<string, unknown>) {
  let response = await edgeCall(request, { action: 'forward-webhook', payload })
  if (response.status === 503) {
    const error = await edgeError(response)
    if (error.code !== 'MALVO_EDGE_NOT_BOOTSTRAPPED') throw error
    await bootstrapMalvoEdgeRuntime(request)
    response = await edgeCall(request, { action: 'forward-webhook', payload })
  }
  if (!response.ok) throw await edgeError(response)
  return response.json() as Promise<{ ok: true; accepted?: boolean; duplicate?: boolean }>
}
