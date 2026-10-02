import { randomBytes } from 'node:crypto'
import { API_SCOPE_SET, hashApiSecret, type ApiScope } from './apiKeys'

const PREFIX = 'rpg_dev_live_'

export function generateDeveloperSecret() {
  const prefix = randomBytes(4).toString('hex')
  const secret = randomBytes(32).toString('base64url')
  return {
    prefix,
    secret,
    secretHash: hashApiSecret(secret),
    token: `${PREFIX}${prefix}_${secret}`,
  }
}

export function parseDeveloperSecret(value: string | null | undefined): { prefix: string; secret: string } | null {
  if (!value) return null
  const match = /^rpg_dev_live_([A-Fa-f0-9]{8})_([A-Za-z0-9_-]{30,})$/.exec(value)
  if (!match) return null
  return { prefix: match[1], secret: match[2] }
}

export function generateConnectionToken() {
  return randomBytes(32).toString('base64url')
}

export function normalizeDeveloperScopes(input: unknown): ApiScope[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input.filter((scope): scope is ApiScope => typeof scope === 'string' && API_SCOPE_SET.has(scope)))]
}
