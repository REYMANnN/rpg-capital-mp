/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { decodeStateWith, encodeStateWith, merchantCodeFromMemberships, signWith, SUMUP_PATHS, verifyWith, type OAuthState } from '@/lib/sumup/core'

// Cliente da SumUp (OAuth + Cloud API da Solo). Sem SDK: fetch direto.
// Credenciais por loja ficam no Vault (rpg_tap_merchants); o access token do OAuth
// é renovado sozinho com o refresh token.

const API = 'https://api.sumup.com'
export const SITE = 'https://www.rpgcapital.com.br'
export const SUMUP_CALLBACK_URL = `${SITE}/api/sumup/callback`

function env(name: string) {
  return process.env[name]?.trim() || ''
}

export function sumupOAuthConfigured() {
  return Boolean(env('SUMUP_CLIENT_ID') && env('SUMUP_CLIENT_SECRET'))
}

// Escopos pedidos no OAuth. readers.* precisa ser liberado pela SumUp no app.
export function sumupScopes() {
  return env('SUMUP_OAUTH_SCOPES') || 'transactions.history user.profile_readonly readers.read readers.write'
}

export function sumupSignupUrl() {
  return env('SUMUP_SIGNUP_URL') || 'https://me.sumup.com/signup'
}

export function affiliate() {
  const key = env('SUMUP_AFFILIATE_KEY')
  const appId = env('SUMUP_AFFILIATE_APP_ID')
  return key && appId ? { key, app_id: appId } : null
}

// ---------- Assinatura (state do OAuth e URL do webhook) ----------

function signingSecret() {
  return env('SUMUP_STATE_SECRET') || env('BALCAO_LINK_SECRET')
}

export function sign(value: string) {
  return signWith(signingSecret(), value)
}

export function verifySignature(value: string, signature: string) {
  return verifyWith(signingSecret(), value, signature)
}

export function encodeState(input: Omit<OAuthState, 'exp' | 'nonce'>) {
  return encodeStateWith(signingSecret(), input)
}

export function decodeState(state: string): OAuthState | null {
  return decodeStateWith(signingSecret(), state)
}

export function authorizeUrl(state: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env('SUMUP_CLIENT_ID'),
    redirect_uri: SUMUP_CALLBACK_URL,
    scope: sumupScopes(),
    state,
  })
  return `${API}/authorize?${params.toString()}`
}

// ---------- Tokens ----------

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(`${API}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...body, client_id: env('SUMUP_CLIENT_ID'), client_secret: env('SUMUP_CLIENT_SECRET') }).toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  const json = await response.json().catch(() => null) as (TokenResponse & { error?: string; error_description?: string }) | null
  if (!response.ok || !json?.access_token) {
    throw new SumUpError(`token: ${json?.error || response.status} ${json?.error_description || ''}`.trim(), response.status, json?.error)
  }
  return json
}

export async function exchangeCode(code: string) {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: SUMUP_CALLBACK_URL })
}

export class SumUpError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
  }
}

type Credentials = { authType: 'api_key' | 'oauth'; accessToken: string; refreshToken: string | null; expiresAt: number | null; merchantCode: string | null }

async function loadCredentials(storeId: string): Promise<Credentials | null> {
  const { data, error } = await createAdminClient().rpc('rpg_sumup_credentials', { p_store: storeId })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as { auth_type: string; access_token: string | null; refresh_token: string | null; access_expires_at: string | null; merchant_code: string | null } | null
  if (!row?.access_token) return null
  return {
    authType: row.auth_type === 'oauth' ? 'oauth' : 'api_key',
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.access_expires_at ? new Date(row.access_expires_at).getTime() : null,
    merchantCode: row.merchant_code,
  }
}

export async function saveOAuth(input: { storeId: string; userId: string | null; tokens: TokenResponse; merchantCode: string | null; country: string | null }) {
  const expiresAt = new Date(Date.now() + Math.max(60, Number(input.tokens.expires_in || 3600) - 60) * 1000).toISOString()
  const { error } = await createAdminClient().rpc('rpg_sumup_save_oauth', {
    p_store: input.storeId,
    p_access: input.tokens.access_token,
    p_refresh: input.tokens.refresh_token || null,
    p_expires_at: expiresAt,
    p_merchant: input.merchantCode,
    p_country: input.country,
    p_scopes: input.tokens.scope || null,
    p_user: input.userId,
  })
  if (error) throw error
}

async function freshToken(storeId: string, force = false): Promise<{ token: string; merchantCode: string | null } | null> {
  const creds = await loadCredentials(storeId)
  if (!creds) return null
  if (creds.authType === 'api_key') return { token: creds.accessToken, merchantCode: creds.merchantCode }
  const expiring = !creds.expiresAt || creds.expiresAt - Date.now() < 60_000
  if (!force && !expiring) return { token: creds.accessToken, merchantCode: creds.merchantCode }
  if (!creds.refreshToken) return { token: creds.accessToken, merchantCode: creds.merchantCode }
  try {
    const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: creds.refreshToken })
    await saveOAuth({ storeId, userId: null, tokens, merchantCode: creds.merchantCode, country: null })
    return { token: tokens.access_token, merchantCode: creds.merchantCode }
  } catch (error) {
    // Refresh inválido: a conexão caiu; o lojista precisa conectar de novo.
    if (error instanceof SumUpError && error.code === 'invalid_grant') {
      await createAdminClient().rpc('rpg_sumup_mark_invalid', { p_store: storeId })
      return null
    }
    throw error
  }
}

// ---------- Chamadas à API ----------

export async function sumupFetch(token: string, path: string, init?: { method?: string; body?: unknown }) {
  const response = await fetch(`${API}${path}`, {
    method: init?.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  const text = await response.text().catch(() => '')
  let json: unknown = null
  try { json = text ? JSON.parse(text) : null } catch {}
  return { ok: response.ok, status: response.status, json: json as Record<string, any> | null, text }
}

// Chamada autenticada pela loja, renovando o token uma vez se a SumUp disser 401.
export async function storeFetch(storeId: string, path: (merchantCode: string) => string, init?: { method?: string; body?: unknown }) {
  let creds = await freshToken(storeId)
  if (!creds) throw new SumUpError('sumup_not_connected', 401, 'not_connected')
  let merchantCode = creds.merchantCode
  if (!merchantCode) {
    merchantCode = await fetchMerchantCode(creds.token)
    if (merchantCode) await createAdminClient().from('rpg_tap_merchants').update({ sumup_merchant_code: merchantCode }).eq('store_id', storeId)
  }
  if (!merchantCode) throw new SumUpError('merchant_code_missing', 400, 'merchant_code_missing')
  let result = await sumupFetch(creds.token, path(merchantCode), init)
  if (result.status === 401) {
    creds = await freshToken(storeId, true)
    if (!creds) throw new SumUpError('sumup_not_connected', 401, 'not_connected')
    result = await sumupFetch(creds.token, path(merchantCode), init)
  }
  return result
}

export async function fetchMerchantCode(token: string): Promise<string | null> {
  const memberships = await sumupFetch(token, SUMUP_PATHS.memberships)
  const fromMemberships = memberships.ok ? merchantCodeFromMemberships(memberships.json) : null
  if (fromMemberships) return fromMemberships
  // Endpoint antigo, fora da especificação atual, mas ainda usado por integrações existentes.
  const me = await sumupFetch(token, '/v0.1/me')
  const code = me.json?.merchant_profile?.merchant_code || me.json?.merchant_code
  return typeof code === 'string' && code ? code : null
}

export async function fetchMerchantCountry(token: string): Promise<string | null> {
  const me = await sumupFetch(token, '/v0.1/me')
  const country = me.json?.merchant_profile?.address?.country || me.json?.merchant_profile?.country
  return typeof country === 'string' && country ? country : null
}

export function errorMessage(result: { status: number; json: Record<string, any> | null; text: string }) {
  const json = result.json
  const detail = json?.detail || json?.message || json?.error_message || json?.errors?.detail || json?.title
  return `SumUp ${result.status}: ${String(detail || result.text || 'erro').slice(0, 300)}`
}

export async function sumupConnected(storeId: string) {
  const { data } = await createAdminClient().from('rpg_tap_merchants').select('status,sumup_merchant_code').eq('store_id', storeId).maybeSingle()
  return data?.status === 'active'
}
