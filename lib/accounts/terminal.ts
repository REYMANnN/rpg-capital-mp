import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const TERMINAL_COOKIE = 'balcao_terminal'
export const STAFF_SESSION_COOKIE = 'balcao_staff_session'
export const INVENTORY_INSTALLATION_COOKIE = 'inventory_installation_id'
export const INVITE_TTL_MS = 15 * 60 * 1000
export const STAFF_SESSION_IDLE_MS = 30 * 60 * 1000
export const STAFF_SESSION_MAX_MS = 12 * 60 * 60 * 1000

export function makeSecret(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

export function secretsMatch(secret: string, hash: string): boolean {
  const calculated = Buffer.from(hashSecret(secret), 'hex')
  const expected = Buffer.from(hash, 'hex')
  return calculated.length === expected.length && timingSafeEqual(calculated, expected)
}

export function packCredential(id: string, secret: string): string {
  return `${id}.${secret}`
}

export function unpackCredential(value: string | null | undefined): { id: string; secret: string } | null {
  if (!value) return null
  const dot = value.indexOf('.')
  if (dot <= 0 || dot === value.length - 1) return null
  const id = value.slice(0, dot)
  const secret = value.slice(dot + 1)
  if (!/^[0-9a-f-]{36}$/i.test(id) || !secret) return null
  return { id, secret }
}

export function isInviteUsable(invite: { expiresAt: string; usedAt?: string | null; revokedAt?: string | null }, now = new Date()): boolean {
  return !invite.usedAt && !invite.revokedAt && new Date(invite.expiresAt).getTime() > now.getTime()
}
