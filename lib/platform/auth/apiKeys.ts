import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const API_SCOPES = [
  'products:read','products:write',
  'inventory:read','inventory:write',
  'sales:read','sales:ingest',
  'finance:read',
  'pricing:read','pricing:write',
  'webhooks:manage',
] as const
export type ApiScope = typeof API_SCOPES[number]
export const API_SCOPE_SET = new Set<string>(API_SCOPES)

const PREFIX = 'rpg_live_'
function base64url(bytes: number) { return randomBytes(bytes).toString('base64url') }
export function hashApiSecret(secret: string) { return createHash('sha256').update(secret, 'utf8').digest('hex') }

export function generateApiKey() {
  const prefix = base64url(6).slice(0, 8)
  const secret = base64url(32)
  return { prefix, secret, secretHash: hashApiSecret(secret), token: `${PREFIX}${prefix}_${secret}` }
}

export function parseApiKey(value: string | null | undefined): { prefix: string; secret: string } | null {
  if (!value?.startsWith(PREFIX)) return null
  const rest = value.slice(PREFIX.length)
  const split = rest.indexOf('_')
  if (split !== 8) return null
  const prefix = rest.slice(0, split); const secret = rest.slice(split + 1)
  if (!/^[A-Za-z0-9_-]{8}$/.test(prefix) || !/^[A-Za-z0-9_-]{30,}$/.test(secret)) return null
  return { prefix, secret }
}

export function apiSecretMatches(secret: string, expectedHash: string) {
  const actual = Buffer.from(hashApiSecret(secret), 'hex'); const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
export function isSensitiveScope(scope: ApiScope) { return scope === 'finance:read' || scope.endsWith(':write') || scope.endsWith(':ingest') || scope === 'webhooks:manage' }
export function normalizeScopes(input: unknown): ApiScope[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input.filter((scope): scope is ApiScope => typeof scope === 'string' && API_SCOPE_SET.has(scope)))]
}
