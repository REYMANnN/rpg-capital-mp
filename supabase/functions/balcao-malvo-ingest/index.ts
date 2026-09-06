import { createClient } from 'npm:@supabase/supabase-js@2.105.3'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.2.0'

// Supabase Edge Functions expose waitUntil at runtime even though it is not part
// of the standard Deno type surface.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const MALVO_API = 'https://api.malvo.io'
const TEAM_SLUG = 'renanguadalupe05-5169s-projects'
const TEAM_ID = 'team_HF88ws9zOEewBPwDBvmBDzjG'
const PROJECT_NAME = 'rpg-capital-mp-25zw'
const PROJECT_ID = 'prj_d2elDb254SXSBjzNhGRE6UR8fAfc'
const EXPECTED_SUBJECT = `owner:${TEAM_SLUG}:project:${PROJECT_NAME}:environment:production`
const EXPECTED_AUDIENCE = `https://vercel.com/${TEAM_SLUG}`
const TEAM_ISSUER = `https://oidc.vercel.com/${TEAM_SLUG}`
const GLOBAL_ISSUER = 'https://oidc.vercel.com'
const JWKS = createRemoteJWKSet(new URL('https://oidc.vercel.com/.well-known/jwks'))

const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() || ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  || Deno.env.get('SUPABASE_SECRET_KEY')?.trim()
  || ''
if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase Edge runtime is missing privileged credentials')

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

type RuntimeSecrets = {
  clientId: string
  clientSecret: string
  webhookSecret: string
  webhookEgressIp: string | null
}

type AnyRecord = Record<string, any>
let cachedApiKey: { value: string; expiresAt: number; clientId: string } | null = null

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function bearer(request: Request) {
  const value = request.headers.get('authorization') || ''
  return value.startsWith('Bearer ') ? value.slice(7) : ''
}

function safeEqual(leftValue: string, rightValue: string) {
  const left = new TextEncoder().encode(leftValue)
  const right = new TextEncoder().encode(rightValue)
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i]
  return diff === 0
}

async function verifyVercel(request: Request) {
  const token = bearer(request)
  if (!token) throw new Error('VERCEL_OIDC_MISSING')
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: [TEAM_ISSUER, GLOBAL_ISSUER],
    audience: EXPECTED_AUDIENCE,
    subject: EXPECTED_SUBJECT,
  })
  if (String(payload.owner_id || '') !== TEAM_ID
      || String(payload.project_id || '') !== PROJECT_ID
      || String(payload.environment || '') !== 'production') {
    throw new Error('VERCEL_OIDC_SCOPE_MISMATCH')
  }
  return payload
}

async function getSecrets(required = true): Promise<RuntimeSecrets | null> {
  const { data, error } = await admin.rpc('balcao_get_malvo_runtime_secrets')
  if (error) throw error
  const row = data && typeof data === 'object' ? data as AnyRecord : {}
  const clientId = typeof row.clientId === 'string' ? row.clientId : ''
  const clientSecret = typeof row.clientSecret === 'string' ? row.clientSecret : ''
  const webhookSecret = typeof row.webhookSecret === 'string' ? row.webhookSecret : ''
  if (!clientId || !clientSecret || !webhookSecret) {
    if (required) throw new Error('MALVO_EDGE_NOT_BOOTSTRAPPED')
    return null
  }
  return {
    clientId,
    clientSecret,
    webhookSecret,
    webhookEgressIp: typeof row.webhookEgressIp === 'string' && row.webhookEgressIp ? row.webhookEgressIp : null,
  }
}

async function parseMalvoResponse(response: Response) {
  const body = await response.json().catch(() => ({})) as AnyRecord
  if (!response.ok) {
    const error = new Error(typeof body.message === 'string' ? body.message : `Malvo request failed (${response.status})`) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return body
}

async function getMalvoApiKey(secrets: RuntimeSecrets, force = false) {
  if (!force && cachedApiKey && cachedApiKey.clientId === secrets.clientId && cachedApiKey.expiresAt > Date.now()) {
    return cachedApiKey.value
  }
  const response = await fetch(`${MALVO_API}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: secrets.clientId, clientSecret: secrets.clientSecret }),
  })
  const body = await parseMalvoResponse(response)
  if (typeof body.apiKey !== 'string' || !body.apiKey) throw new Error('Malvo auth returned no apiKey')
  cachedApiKey = { value: body.apiKey, clientId: secrets.clientId, expiresAt: Date.now() + 110 * 60 * 1000 }
  return body.apiKey
}

async function malvoRequest(path: string, secrets: RuntimeSecrets, init: RequestInit = {}, retry = true) {
  const apiKey = await getMalvoApiKey(secrets)
  const response = await fetch(`${MALVO_API}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      'X-API-KEY': apiKey,
      ...(init.headers || {}),
    },
  })
  if (retry && response.status === 401) {
    await getMalvoApiKey(secrets, true)
    return malvoRequest(path, secrets, init, false)
  }
  return parseMalvoResponse(response)
}

function edgeWebhookUrl() {
  return `${supabaseUrl}/functions/v1/balcao-malvo-ingest`
}

async function ensureDirectWebhook(secrets: RuntimeSecrets) {
  const listed = await malvoRequest('/webhooks', secrets)
  const rows = Array.isArray(listed.results) ? listed.results as AnyRecord[] : []
  const existing = rows.find((row) => row.url === edgeWebhookUrl() && row.event === 'all' && !row.disabled)
  if (existing) return existing
  return malvoRequest('/webhooks', secrets, {
    method: 'POST',
    body: JSON.stringify({
      url: edgeWebhookUrl(),
      event: 'all',
      headers: { Authorization: `Bearer ${secrets.webhookSecret}` },
    }),
  })
}

function parseContext(value: unknown) {
  if (typeof value !== 'string') return null
  const match = /^balcao:([0-9a-f-]{36}):([0-9a-f-]{36})$/i.exec(value)
  return match ? { businessId: match[1], storeId: match[2] } : null
}

function cents(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number * 100) : 0
}

function digits(value: unknown) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : ''
}

function maskedNumber(value: unknown) {
  if (typeof value !== 'string') return null
  const clean = value.replace(/\s+/g, '')
  return clean.length > 4 ? clean.slice(-4) : clean || null
}

function connectionStatus(item: AnyRecord) {
  if (item?.status === 'UPDATED' && ['SUCCESS', 'PARTIAL_SUCCESS'].includes(String(item?.executionStatus))) return 'active'
  if (['CREATING', 'UPDATING', 'LOGIN_IN_PROGRESS'].includes(String(item?.status))) return 'updating'
  if (['WAITING_USER_INPUT', 'WAITING_USER_ACTION'].includes(String(item?.status))) return 'attention'
  if (['USER_AUTHORIZATION_PENDING', 'WAITING_USER_INPUT', 'WAITING_USER_ACTION'].includes(String(item?.executionStatus))) return 'attention'
  if (['LOGIN_ERROR', 'OUTDATED'].includes(String(item?.status)) || item?.error) return 'error'
  return 'pending'
}

function counterparty(transaction: AnyRecord) {
  const merchant = transaction?.merchant && typeof transaction.merchant === 'object' ? transaction.merchant : null
  if (merchant) return { name: merchant.businessName || merchant.name || null, taxId: merchant.cnpj || null }
  const debit = transaction?.type === 'DEBIT'
  const party = transaction?.paymentData?.[debit ? 'receiver' : 'payer']
  return {
    name: party?.name || party?.legalName || null,
    taxId: party?.document || party?.taxNumber || null,
  }
}

function isInternalTransfer(transaction: AnyRecord, ownerDocuments: Set<string>) {
  const payer = digits(transaction?.paymentData?.payer?.document || transaction?.paymentData?.payer?.taxNumber)
  const receiver = digits(transaction?.paymentData?.receiver?.document || transaction?.paymentData?.receiver?.taxNumber)
  if (payer && receiver && payer === receiver) return true
  return Boolean(payer && receiver && ownerDocuments.has(payer) && ownerDocuments.has(receiver))
}

async function getItem(itemId: string, secrets: RuntimeSecrets) {
  return malvoRequest(`/items/${encodeURIComponent(itemId)}`, secrets)
}

async function listAccounts(itemId: string, secrets: RuntimeSecrets) {
  const all: AnyRecord[] = []
  let page = 1
  let totalPages = 1
  do {
    const body = await malvoRequest(`/accounts?itemId=${encodeURIComponent(itemId)}&page=${page}&pageSize=100`, secrets)
    all.push(...(Array.isArray(body.results) ? body.results : []))
    totalPages = Number(body.totalPages || 1)
    page += 1
  } while (page <= totalPages && page <= 100)
  return all
}

async function listTransactions(accountId: string, secrets: RuntimeSecrets) {
  const all: AnyRecord[] = []
  let next: string | null = `?accountId=${encodeURIComponent(accountId)}`
  let pages = 0
  while (next && pages < 100) {
    const body = await malvoRequest(`/v2/transactions${next}`, secrets)
    all.push(...(Array.isArray(body.results) ? body.results : []))
    next = typeof body.next === 'string' && body.next ? body.next : null
    pages += 1
  }
  return all
}

async function upsertConnection(context: { businessId: string; storeId: string }, item: AnyRecord, clientUserId: string, status?: string, error?: { code?: string | null; message?: string | null }) {
  const now = new Date().toISOString()
  const { error: dbError } = await admin.from('balcao_finance_connections').upsert({
    business_id: context.businessId,
    store_id: context.storeId,
    provider: 'malvo',
    provider_item_id: String(item.id),
    client_user_id: clientUserId,
    institution_name: item?.connector?.name || null,
    institution_logo_url: item?.connector?.imageUrl || null,
    status: status || connectionStatus(item),
    execution_status: item?.executionStatus || null,
    consent_expires_at: item?.consentExpiresAt || null,
    last_synced_at: item?.lastUpdatedAt || null,
    last_reconciled_at: now,
    last_error_code: error?.code || item?.error?.code || null,
    last_error_message: error?.message || item?.error?.message || null,
    updated_at: now,
  }, { onConflict: 'provider,provider_item_id' })
  if (dbError) throw dbError
}

async function syncMalvoItem(itemId: string, hintedClientUserId: unknown, secrets: RuntimeSecrets) {
  const item = await getItem(itemId, secrets)
  const clientUserId = String(item.clientUserId || hintedClientUserId || '')
  const context = parseContext(clientUserId)
  if (!context) throw new Error('Invalid Balcao clientUserId on Malvo item')

  await upsertConnection(context, item, clientUserId)
  const remoteAccounts = (await listAccounts(itemId, secrets)).filter((account) => account?.type === 'BANK')
  const ownerDocuments = new Set(remoteAccounts.map((account) => digits(account.taxNumber)).filter(Boolean))
  const activeExternalIds: string[] = []
  let transactionCount = 0

  for (const account of remoteAccounts) {
    const externalId = String(account.id)
    activeExternalIds.push(externalId)
    const { data: localAccount, error: accountError } = await admin.from('balcao_finance_accounts').upsert({
      business_id: context.businessId,
      store_id: context.storeId,
      provider: 'malvo',
      external_id: externalId,
      institution_name: item?.connector?.name || 'Instituição financeira',
      account_name: account.name || account.marketingName || null,
      account_type: account.subtype || account.type || null,
      masked_number: maskedNumber(account.number),
      balance_cents: cents(account.balance),
      currency: account.currencyCode || 'BRL',
      status: 'active',
      source: 'malvo',
      last_synced_at: account.balanceUpdatedAt || item.lastUpdatedAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,provider,external_id' }).select('id').single()
    if (accountError || !localAccount?.id) throw accountError || new Error('Could not persist Malvo account')

    const remoteTransactions = await listTransactions(externalId, secrets)
    const rows = remoteTransactions.map((transaction) => {
      const party = counterparty(transaction)
      return {
        business_id: context.businessId,
        store_id: context.storeId,
        account_id: localAccount.id,
        external_id: String(transaction.id),
        posted_at: transaction.date,
        amount_cents: cents(transaction.amount),
        description: String(transaction.description || transaction.descriptionRaw || 'Movimentação'),
        counterparty_name: party.name,
        counterparty_tax_id: party.taxId,
        category: transaction?.merchant?.category || transaction?.category || 'Outros',
        category_confidence: null,
        transaction_type: transaction.operationType || transaction.type || null,
        is_internal_transfer: isInternalTransfer(transaction, ownerDocuments),
        source: 'malvo',
      }
    }).filter((row) => row.posted_at && row.amount_cents !== 0)

    for (let start = 0; start < rows.length; start += 500) {
      const batch = rows.slice(start, start + 500)
      if (!batch.length) continue
      const { error: txError } = await admin.from('balcao_finance_transactions').upsert(batch, { onConflict: 'account_id,external_id' })
      if (txError) throw txError
      transactionCount += batch.length
    }
  }

  const { data: existing, error: existingError } = await admin.from('balcao_finance_accounts')
    .select('id,external_id')
    .eq('business_id', context.businessId)
    .eq('store_id', context.storeId)
    .eq('provider', 'malvo')
  if (existingError) throw existingError
  const staleIds = (existing || []).filter((row) => !activeExternalIds.includes(String(row.external_id))).map((row) => row.id)
  if (staleIds.length) {
    const { error } = await admin.from('balcao_finance_accounts').update({ status: 'disconnected', updated_at: new Date().toISOString() }).in('id', staleIds)
    if (error) throw error
  }

  await upsertConnection(context, item, clientUserId, connectionStatus(item))
  return { itemId, accountCount: remoteAccounts.length, transactionCount }
}

async function deleteTransactions(payload: AnyRecord) {
  if (!Array.isArray(payload.transactionIds) || !payload.transactionIds.length) return
  const context = parseContext(payload.clientUserId)
  if (!context) return
  const { data: accounts, error } = await admin.from('balcao_finance_accounts')
    .select('id')
    .eq('business_id', context.businessId)
    .eq('store_id', context.storeId)
    .eq('provider', 'malvo')
  if (error) throw error
  const accountIds = (accounts || []).map((row) => row.id)
  if (!accountIds.length) return
  const { error: deleteError } = await admin.from('balcao_finance_transactions')
    .delete()
    .in('account_id', accountIds)
    .in('external_id', payload.transactionIds.map(String))
  if (deleteError) throw deleteError
}

async function markDeleted(payload: AnyRecord) {
  const context = parseContext(payload.clientUserId)
  if (!context || typeof payload.itemId !== 'string') return
  const now = new Date().toISOString()
  const { error: connectionError } = await admin.from('balcao_finance_connections')
    .update({ status: 'disconnected', updated_at: now, last_reconciled_at: now })
    .eq('provider', 'malvo')
    .eq('provider_item_id', payload.itemId)
  if (connectionError) throw connectionError
  const { error: accountError } = await admin.from('balcao_finance_accounts')
    .update({ status: 'disconnected', updated_at: now })
    .eq('business_id', context.businessId)
    .eq('store_id', context.storeId)
    .eq('provider', 'malvo')
  if (accountError) throw accountError
}

async function markError(payload: AnyRecord, secrets: RuntimeSecrets) {
  if (typeof payload.itemId !== 'string') return
  const item = await getItem(payload.itemId, secrets).catch(() => ({ id: payload.itemId, clientUserId: payload.clientUserId }))
  const clientUserId = String(item.clientUserId || payload.clientUserId || '')
  const context = parseContext(clientUserId)
  if (!context) return
  await upsertConnection(context, item, clientUserId, 'error', {
    code: payload.error?.code || null,
    message: payload.error?.message || null,
  })
}

async function processPayload(payload: AnyRecord, secrets: RuntimeSecrets) {
  const eventType = String(payload.event || '')
  const itemId = typeof payload.itemId === 'string' ? payload.itemId : ''
  if (eventType === 'transactions/deleted') return deleteTransactions(payload)
  if (eventType === 'item/deleted') return markDeleted(payload)
  if (eventType === 'item/error') return markError(payload, secrets)
  if (itemId && ['item/created', 'item/updated', 'transactions/created', 'transactions/updated'].includes(eventType)) {
    return syncMalvoItem(itemId, payload.clientUserId, secrets)
  }
}

async function processAndMark(payload: AnyRecord, secrets: RuntimeSecrets) {
  try {
    await processPayload(payload, secrets)
    const { error } = await admin.from('balcao_finance_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', payload.eventId)
    if (error) throw error
  } catch (error) {
    // Keep the journal row unprocessed: the 15-minute reconciliation job will retry it.
    console.error('BALCAO Malvo background processing failed', payload.eventId, error)
  }
}

async function journalAndDispatch(payload: AnyRecord, secrets: RuntimeSecrets) {
  if (typeof payload.event !== 'string' || typeof payload.eventId !== 'string') return json({ error: 'Invalid webhook payload' }, 400)
  const row = {
    provider: 'malvo',
    event_id: payload.eventId,
    event_type: payload.event,
    provider_item_id: typeof payload.itemId === 'string' ? payload.itemId : null,
    client_user_id: typeof payload.clientUserId === 'string' ? payload.clientUserId : null,
    payload,
  }
  const { error } = await admin.from('balcao_finance_webhook_events').insert(row)
  if (error && error.code !== '23505') {
    console.error('BALCAO Malvo webhook journal failed', error)
    return json({ error: 'Webhook journal failed' }, 500)
  }
  if (error?.code === '23505') {
    const { data } = await admin.from('balcao_finance_webhook_events')
      .select('processed_at').eq('event_id', payload.eventId).maybeSingle()
    if (data?.processed_at) return json({ ok: true, duplicate: true })
  }

  EdgeRuntime.waitUntil(processAndMark(payload, secrets))
  return json({ ok: true, accepted: true }, 202)
}

async function reconcile() {
  const secrets = await getSecrets(true) as RuntimeSecrets
  const { data: pending, error: pendingError } = await admin.from('balcao_finance_webhook_events')
    .select('payload').is('processed_at', null).order('created_at', { ascending: true }).limit(25)
  if (pendingError) throw pendingError
  for (const row of pending || []) {
    if (row.payload && typeof row.payload === 'object') await processAndMark(row.payload as AnyRecord, secrets)
  }

  const cutoff = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString()
  const { data: stale, error: staleError } = await admin.from('balcao_finance_connections')
    .select('provider_item_id,client_user_id')
    .eq('provider', 'malvo')
    .neq('status', 'disconnected')
    .or(`last_reconciled_at.is.null,last_reconciled_at.lt.${cutoff}`)
    .order('last_reconciled_at', { ascending: true, nullsFirst: true })
    .limit(5)
  if (staleError) throw staleError

  for (const connection of stale || []) {
    try {
      await syncMalvoItem(String(connection.provider_item_id), connection.client_user_id, secrets)
    } catch (error) {
      console.error('BALCAO Malvo reconciliation item failed', connection.provider_item_id, error)
      await admin.from('balcao_finance_connections')
        .update({ last_reconciled_at: new Date().toISOString() })
        .eq('provider', 'malvo')
        .eq('provider_item_id', connection.provider_item_id)
    }
  }
}

async function handleBootstrap(request: Request, body: AnyRecord) {
  await verifyVercel(request)
  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : ''
  const clientSecret = typeof body.clientSecret === 'string' ? body.clientSecret.trim() : ''
  const webhookSecret = typeof body.webhookSecret === 'string' ? body.webhookSecret.trim() : ''
  const webhookEgressIp = typeof body.webhookEgressIp === 'string' ? body.webhookEgressIp.trim() : ''
  if (!clientId || !clientSecret || !webhookSecret) return json({ error: 'Missing Malvo runtime configuration' }, 400)

  const { error } = await admin.rpc('balcao_store_malvo_runtime_secrets', {
    p_client_id: clientId,
    p_client_secret: clientSecret,
    p_webhook_secret: webhookSecret,
    p_webhook_egress_ip: webhookEgressIp || null,
  })
  if (error) throw error

  const secrets: RuntimeSecrets = { clientId, clientSecret, webhookSecret, webhookEgressIp: webhookEgressIp || null }
  await ensureDirectWebhook(secrets)
  return json({ ok: true, webhookUrl: edgeWebhookUrl() })
}

async function handleForward(request: Request, body: AnyRecord) {
  await verifyVercel(request)
  const secrets = await getSecrets(false)
  if (!secrets) return json({ error: 'Malvo Edge runtime not bootstrapped', code: 'MALVO_EDGE_NOT_BOOTSTRAPPED' }, 503)
  const payload = body.payload && typeof body.payload === 'object' ? body.payload as AnyRecord : null
  if (!payload) return json({ error: 'Missing webhook payload' }, 400)
  return journalAndDispatch(payload, secrets)
}

async function handleReconcile(request: Request) {
  const secret = request.headers.get('x-balcao-reconcile-secret') || ''
  const { data: matches, error } = await admin.rpc('balcao_malvo_reconcile_secret_matches', { p_secret: secret })
  if (error || matches !== true) return json({ error: 'Unauthorized' }, 401)
  EdgeRuntime.waitUntil(reconcile().catch((caught) => console.error('BALCAO Malvo reconciliation failed', caught)))
  return json({ ok: true, accepted: true }, 202)
}

async function handleDirectWebhook(request: Request, payload: AnyRecord) {
  const secrets = await getSecrets(false)
  if (!secrets) return json({ error: 'Malvo Edge runtime not bootstrapped', code: 'MALVO_EDGE_NOT_BOOTSTRAPPED' }, 503)
  if (!safeEqual(bearer(request), secrets.webhookSecret)) return json({ error: 'Unauthorized' }, 401)
  if (secrets.webhookEgressIp) {
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || ''
    if (forwarded && forwarded !== secrets.webhookEgressIp) return json({ error: 'Unauthorized' }, 401)
  }
  return journalAndDispatch(payload, secrets)
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const body = await request.json().catch(() => null) as AnyRecord | null
  if (!body) return json({ error: 'Invalid JSON' }, 400)
  try {
    if (body.action === 'bootstrap') return await handleBootstrap(request, body)
    if (body.action === 'forward-webhook') return await handleForward(request, body)
    if (body.action === 'reconcile') return await handleReconcile(request)
    return await handleDirectWebhook(request, body)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    if (message.startsWith('VERCEL_OIDC_')) return json({ error: 'Unauthorized' }, 401)
    if (message === 'MALVO_EDGE_NOT_BOOTSTRAPPED') return json({ error: message, code: message }, 503)
    console.error('BALCAO Malvo Edge failure', error)
    return json({ error: 'Internal error' }, 500)
  }
})
