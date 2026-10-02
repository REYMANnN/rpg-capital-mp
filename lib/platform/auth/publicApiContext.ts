import { createInventoryCloudClient } from '@/lib/supabase/inventoryCloud'\nimport { createAdminClient } from '@/lib/supabase/admin'
import { hashApiSecret, parseApiKey, type ApiScope } from './apiKeys'
import { parseDeveloperSecret } from './developerKeys'

export type RateClass = 'read' | 'write' | 'bulk' | 'export'
const RATE_LIMITS: Record<RateClass, number> = { read: 120, write: 30, bulk: 20, export: 12 }

export type PublicApiContext = {
  keyId: string
  legacyApiKeyId: string | null
  connectionId: string | null
  businessId: string
  storeId: string
  installationId: string
  scopes: ReadonlySet<ApiScope>
  keyPrefix: string
  requestId: string
}

export class PublicApiError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter?: number) {
    super(message)
  }
}

function bearer(request: Request) {
  const value = request.headers.get('authorization') ?? ''
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : ''
}

function inferredRate(scope: ApiScope): RateClass {
  return scope.endsWith(':ingest') ? 'bulk' : scope.endsWith(':write') || scope === 'webhooks:manage' ? 'write' : 'read'
}

function requestedStore(request: Request) {
  const value = request.headers.get('x-rpg-store-id')?.trim() ?? ''
  return /^[0-9a-f-]{36}$/i.test(value) ? value : null
}

function requestedConnection(request: Request) {
  const value = request.headers.get('x-rpg-connection-id')?.trim() ?? ''
  return /^[0-9a-f-]{36}$/i.test(value) ? value : null
}

function handleAuthFailure(result: Record<string, unknown>, requiredScope: ApiScope, developer: boolean): never {
  const code = String(result.code ?? 'invalid_api_key')
  if (code === 'missing_scope') throw new PublicApiError(403, code, `A conexão precisa da permissão ${requiredScope}.`)
  if (code === 'invalid_connection') throw new PublicApiError(403, code, 'A conexão não existe, foi revogada ou não pertence a este aplicativo.')
  if (code === 'store_required') throw new PublicApiError(400, code, 'Informe X-RPG-Store-Id para uma chave de negócio.')
  if (code === 'store_forbidden') throw new PublicApiError(403, code, 'Esta credencial não acessa essa loja.')
  if (code === 'rate_limited') throw new PublicApiError(429, code, 'Limite de requisições atingido.', Number(result.retryAfter ?? 60))
  throw new PublicApiError(401, 'invalid_api_key', developer ? 'Chave Developer inválida, revogada ou desativada.' : 'Chave inválida, inativa ou expirada.')
}

export async function requirePublicApi(request: Request, requiredScope: ApiScope, rateClass?: RateClass): Promise<PublicApiContext> {
  const token = bearer(request)
  const limit = RATE_LIMITS[rateClass ?? inferredRate(requiredScope)]
  const developer = parseDeveloperSecret(token)

  if (developer) {
    const connectionId = requestedConnection(request)
    if (!connectionId) throw new PublicApiError(400, 'connection_required', 'Informe X-RPG-Connection-Id para uma chave Developer.')

    const { data, error } = await createAdminClient().rpc('rpg_developer_api_authenticate', {
      p_prefix: developer.prefix,
      p_secret_hash: hashApiSecret(developer.secret),
      p_connection_id: connectionId,
      p_required_scope: requiredScope,
      p_limit: limit,
    })
    if (error) throw error
    const result = (data ?? {}) as Record<string, unknown>
    if (!result.ok) handleAuthFailure(result, requiredScope, true)

    return {
      keyId: String(result.credentialId),
      legacyApiKeyId: null,
      connectionId: String(result.connectionId),
      businessId: String(result.businessId),
      storeId: String(result.storeId),
      installationId: String(result.installationId),
      scopes: new Set((Array.isArray(result.scopes) ? result.scopes : []) as ApiScope[]),
      keyPrefix: developer.prefix,
      requestId: `req_${crypto.randomUUID().replace(/-/g, '')}`,
    }
  }

  const legacy = parseApiKey(token)
  if (!legacy) throw new PublicApiError(401, 'invalid_api_key', 'Use uma chave de API válida.')

  const { data, error } = await createInventoryCloudClient().rpc('balcao_public_api_authenticate', {
    p_prefix: legacy.prefix,
    p_secret_hash: hashApiSecret(legacy.secret),
    p_requested_store_id: requestedStore(request),
    p_required_scope: requiredScope,
    p_limit: limit,
  })
  if (error) throw error
  const result = (data ?? {}) as Record<string, unknown>
  if (!result.ok) handleAuthFailure(result, requiredScope, false)

  return {
    keyId: String(result.keyId),
    legacyApiKeyId: String(result.keyId),
    connectionId: null,
    businessId: String(result.businessId),
    storeId: String(result.storeId),
    installationId: String(result.installationId),
    scopes: new Set((Array.isArray(result.scopes) ? result.scopes : []) as ApiScope[]),
    keyPrefix: legacy.prefix,
    requestId: `req_${crypto.randomUUID().replace(/-/g, '')}`,
  }
}

export function publicApiError(error: unknown) {
  if (error instanceof PublicApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { ...(error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {}), 'cache-control': 'private, no-store' } },
    )
  }
  console.error('BALCAO public API failed', error)
  return Response.json({ error: { code: 'internal_error', message: 'Não conseguimos concluir a solicitação.' } }, { status: 500 })
}
