import { createHmac, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'

// Partes puras do painel de admin (sem banco), testadas em tests/accounts/adminPanel.test.ts.

export const ADMIN_COOKIE = 'rpg_admin'
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60
export const SITE_URL = 'https://www.rpgcapital.com.br'
export const COUPON_COOKIE = 'rpg_coupon'
export const PAYMENT_LINK = `${SITE_URL}/assinar`
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function secret() {
  const base = process.env.BALCAO_LINK_SECRET?.trim()
  if (!base) throw new Error('BALCAO_LINK_SECRET is not configured')
  return `${base}:rpg-admin`
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function createAdminSession(nowMs = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ exp: nowMs + ADMIN_SESSION_SECONDS * 1000 })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function verifyAdminSession(token: string | undefined | null, nowMs = Date.now()): boolean {
  if (!token) return false
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return false
  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: number }
    return typeof exp === 'number' && exp > nowMs
  } catch {
    return false
  }
}

// Formato: scrypt$N$r$p$salt(base64)$hash(base64)
export function verifyPasswordHash(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltB64, hashB64] = parts
  const expected = Buffer.from(hashB64, 'base64')
  if (!expected.length) return false
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function newCouponCode() {
  let code = 'RPG-'
  for (let i = 0; i < 6; i += 1) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}

export function normalizeCouponCode(value: unknown) {
  const code = String(value ?? '').trim().toUpperCase()
  return /^RPG-[A-Z0-9]{6}$/.test(code) ? code : null
}

export function couponLink(code: string) {
  return `${SITE_URL}/c/${code}`
}

export function courtesyEndMessage(storeName: string, endsAt: Date) {
  const date = endsAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  return `Oi! O período grátis da RPG para ${storeName} terminou.\nPara continuar usando, cadastre seu cartão (R$ 9,99/mês) até ${date}:\n${PAYMENT_LINK}`
}
