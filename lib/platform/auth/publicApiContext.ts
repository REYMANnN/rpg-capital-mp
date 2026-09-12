import { createAdminClient } from '@/lib/supabase/admin'
import { apiSecretMatches, parseApiKey, type ApiScope } from './apiKeys'

export type PublicApiContext = { keyId: string; businessId: string; storeId: string; scopes: ReadonlySet<ApiScope>; keyPrefix: string }
export class PublicApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message) } }

function bearer(request: Request) {
  const value = request.headers.get('authorization') ?? ''
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : ''
}

export async function requirePublicApi(request: Request, requiredScope: ApiScope): Promise<PublicApiContext> {
  const parsed = parseApiKey(bearer(request))
  if (!parsed) throw new PublicApiError(401, 'invalid_api_key', 'Use uma chave de API válida.')
  const admin = createAdminClient()
  const { data: key } = await admin.from('balcao_api_keys').select('id,business_id,store_id,prefix,secret_hash,scopes,status,approval_status,expires_at').eq('prefix', parsed.prefix).maybeSingle()
  if (!key || key.status !== 'active' || key.approval_status !== 'approved' || !apiSecretMatches(parsed.secret, String(key.secret_hash))) throw new PublicApiError(401, 'invalid_api_key', 'Chave inválida ou inativa.')
  if (key.expires_at && new Date(key.expires_at).getTime() <= Date.now()) throw new PublicApiError(401, 'expired_api_key', 'Esta chave expirou.')
  const scopes = new Set((Array.isArray(key.scopes) ? key.scopes : []) as ApiScope[])
  if (!scopes.has(requiredScope)) throw new PublicApiError(403, 'missing_scope', `A chave precisa de ${requiredScope}.`)
  let storeId = key.store_id ? String(key.store_id) : request.headers.get('x-rpg-store-id') ?? ''
  if (!storeId) throw new PublicApiError(400, 'store_required', 'Informe X-RPG-Store-Id para uma chave de negócio.')
  const { data: store } = await admin.from('inventory_v1_stores').select('id,business_id,active').eq('id', storeId).maybeSingle()
  if (!store?.active || String(store.business_id) !== String(key.business_id)) throw new PublicApiError(403, 'store_forbidden', 'Esta chave não acessa essa loja.')
  void admin.from('balcao_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id)
  return { keyId: String(key.id), businessId: String(key.business_id), storeId, scopes, keyPrefix: parsed.prefix }
}

export function publicApiError(error: unknown) {
  if (error instanceof PublicApiError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status })
  console.error('BALCAO public API failed', error)
  return Response.json({ error: { code: 'internal_error', message: 'Não conseguimos concluir a solicitação.' } }, { status: 500 })
}
