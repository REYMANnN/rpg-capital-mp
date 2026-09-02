// Malvo credentials are read from Vercel environment variables at runtime.
const MALVO_API = 'https://api.malvo.io'

type CachedKey = { value: string; expiresAt: number } | null
let cachedApiKey: CachedKey = null

function requiredEnv(name: 'MALVO_CLIENT_ID' | 'MALVO_CLIENT_SECRET' | 'MALVO_WEBHOOK_SECRET') {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function parseResponse(response: Response) {
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const message = typeof body.message === 'string' ? body.message : `Malvo request failed (${response.status})`
    const error = new Error(message) as Error & { status?: number; codeDescription?: string }
    error.status = response.status
    error.codeDescription = typeof body.codeDescription === 'string' ? body.codeDescription : undefined
    throw error
  }
  return body
}

export async function getMalvoApiKey(force = false) {
  if (!force && cachedApiKey && cachedApiKey.expiresAt > Date.now()) return cachedApiKey.value

  const response = await fetch(`${MALVO_API}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: requiredEnv('MALVO_CLIENT_ID'),
      clientSecret: requiredEnv('MALVO_CLIENT_SECRET'),
    }),
    cache: 'no-store',
  })
  const body = await parseResponse(response)
  if (typeof body.apiKey !== 'string' || !body.apiKey) throw new Error('Malvo auth returned no apiKey')
  cachedApiKey = { value: body.apiKey, expiresAt: Date.now() + 110 * 60 * 1000 }
  return body.apiKey
}

async function malvoRequest(path: string, init: RequestInit = {}, retry = true) {
  const apiKey = await getMalvoApiKey()
  const response = await fetch(`${MALVO_API}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      'X-API-KEY': apiKey,
      ...(init.headers || {}),
    },
    cache: 'no-store',
  })

  if (retry && (response.status === 401 || (path === '/connect_token' && response.status === 403))) {
    await getMalvoApiKey(true)
    return malvoRequest(path, init, false)
  }
  return parseResponse(response)
}

export function makeMalvoClientUserId(businessId: string, storeId: string) {
  return `balcao:${businessId}:${storeId}`
}

export function parseMalvoClientUserId(value: unknown) {
  if (typeof value !== 'string') return null
  const match = /^balcao:([0-9a-f-]{36}):([0-9a-f-]{36})$/i.exec(value)
  if (!match) return null
  return { businessId: match[1], storeId: match[2] }
}

export async function ensureMalvoWebhook(webhookUrl: string) {
  const secret = requiredEnv('MALVO_WEBHOOK_SECRET')
  const listed = await malvoRequest('/webhooks')
  const results = Array.isArray(listed.results) ? listed.results as Array<Record<string, unknown>> : []
  const existing = results.find((row) => row.url === webhookUrl && row.event === 'all' && !row.disabled)
  if (existing) return existing

  return malvoRequest('/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      url: webhookUrl,
      event: 'all',
      headers: { Authorization: `Bearer ${secret}` },
    }),
  })
}

export async function createMalvoConnectToken(input: {
  businessId: string
  storeId: string
  oauthRedirectUri: string
  webhookUrl: string
  itemId?: string
}) {
  await ensureMalvoWebhook(input.webhookUrl)
  const body = await malvoRequest('/connect_token', {
    method: 'POST',
    body: JSON.stringify({
      ...(input.itemId ? { itemId: input.itemId } : {}),
      options: {
        clientUserId: makeMalvoClientUserId(input.businessId, input.storeId),
        oauthRedirectUri: input.oauthRedirectUri,
        avoidDuplicates: true,
        products: ['ACCOUNTS', 'TRANSACTIONS'],
      },
    }),
  })
  if (typeof body.accessToken !== 'string' || !body.accessToken) throw new Error('Malvo returned no connect token')
  return body.accessToken
}

export async function getMalvoItem(itemId: string) {
  return malvoRequest(`/items/${encodeURIComponent(itemId)}`) as Promise<Record<string, any>>
}

export async function listMalvoAccounts(itemId: string) {
  const all: Record<string, any>[] = []
  let page = 1
  let totalPages = 1
  do {
    const body = await malvoRequest(`/accounts?itemId=${encodeURIComponent(itemId)}&page=${page}&pageSize=100`)
    const results = Array.isArray(body.results) ? body.results as Record<string, any>[] : []
    all.push(...results)
    totalPages = Number(body.totalPages || 1)
    page += 1
  } while (page <= totalPages && page <= 100)
  return all
}

export async function listMalvoTransactions(accountId: string) {
  const all: Record<string, any>[] = []
  let next: string | null = `?accountId=${encodeURIComponent(accountId)}`
  let pages = 0
  while (next && pages < 100) {
    const body = await malvoRequest(`/v2/transactions${next}`)
    const results = Array.isArray(body.results) ? body.results as Record<string, any>[] : []
    all.push(...results)
    next = typeof body.next === 'string' && body.next ? body.next : null
    pages += 1
  }
  return all
}

export async function refreshMalvoItem(itemId: string) {
  return malvoRequest(`/items/${encodeURIComponent(itemId)}/refresh`, { method: 'POST', body: '{}' })
}
