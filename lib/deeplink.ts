import { randomUUID } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'

import { isBalcaoFlow, type BalcaoFlow } from './whatsapp-flows'

const LINK_AUDIENCE = 'balcao-whatsapp-link'
const SESSION_AUDIENCE = 'balcao-whatsapp-session'
const ISSUER = 'rpg-capital'
export const BALCAO_SESSION_COOKIE = 'rpg_balcao_wa_session'
export const BALCAO_LINK_TTL_SECONDS = 10 * 60
export const BALCAO_SESSION_TTL_SECONDS = 30 * 60

type BaseClaims = {
  wa_id: string
  store_id?: string
  fluxo: BalcaoFlow
  jti: string
}

export type BalcaoLinkClaims = BaseClaims & {
  exp: number
  iat: number
}

export type BalcaoSessionClaims = {
  wa_id: string
  store_id?: string
  fluxo: BalcaoFlow
  jti: string
  exp: number
  iat: number
}

function secret() {
  const value = process.env.BALCAO_LINK_SECRET?.trim()
  if (!value) throw new Error('BALCAO_LINK_SECRET is not configured')
  if (new TextEncoder().encode(value).length < 32) throw new Error('BALCAO_LINK_SECRET must have at least 32 bytes')
  return new TextEncoder().encode(value)
}

function normalizeWaId(value: string) {
  const normalized = value.replace(/\D/g, '')
  if (!normalized) throw new Error('invalid_wa_id')
  return normalized
}

function normalizeStoreId(value: string | null | undefined) {
  if (!value) return undefined
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('invalid_store_id')
  }
  return value
}

export async function createBalcaoDeepLink(
  input: { waId: string; storeId?: string | null; fluxo: BalcaoFlow },
  ttlSeconds = BALCAO_LINK_TTL_SECONDS,
) {
  const wa_id = normalizeWaId(input.waId)
  const store_id = normalizeStoreId(input.storeId)
  const jti = randomUUID()
  const token = await new SignJWT({ wa_id, ...(store_id ? { store_id } : {}), fluxo: input.fluxo })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(LINK_AUDIENCE)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secret())

  return {
    token,
    jti,
    url: `https://www.rpgcapital.com.br/b/${input.fluxo}?t=${encodeURIComponent(token)}`,
  }
}

export async function verifyBalcaoDeepLink(token: string, expectedFlow: BalcaoFlow): Promise<BalcaoLinkClaims> {
  const verified = await jwtVerify(token, secret(), {
    issuer: ISSUER,
    audience: LINK_AUDIENCE,
    algorithms: ['HS256'],
  })
  const payload = verified.payload
  if (!payload.jti || typeof payload.wa_id !== 'string' || !isBalcaoFlow(payload.fluxo) || payload.fluxo !== expectedFlow) {
    throw new Error('invalid_link_claims')
  }
  const store_id = normalizeStoreId(typeof payload.store_id === 'string' ? payload.store_id : undefined)
  if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number') throw new Error('invalid_link_times')
  return {
    wa_id: normalizeWaId(payload.wa_id),
    ...(store_id ? { store_id } : {}),
    fluxo: payload.fluxo,
    jti: payload.jti,
    exp: payload.exp,
    iat: payload.iat,
  }
}

export async function redeemBalcaoDeepLink(
  token: string,
  expectedFlow: BalcaoFlow,
  markUsed: (claims: BalcaoLinkClaims) => Promise<boolean>,
) {
  const claims = await verifyBalcaoDeepLink(token, expectedFlow)
  if (!await markUsed(claims)) throw new Error('link_reused')
  return claims
}

export async function createBalcaoSessionToken(claims: BalcaoLinkClaims, ttlSeconds = BALCAO_SESSION_TTL_SECONDS) {
  return new SignJWT({
    wa_id: claims.wa_id,
    ...(claims.store_id ? { store_id: claims.store_id } : {}),
    fluxo: claims.fluxo,
    jti: claims.jti,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secret())
}

export async function verifyBalcaoSessionToken(token: string): Promise<BalcaoSessionClaims> {
  const verified = await jwtVerify(token, secret(), {
    issuer: ISSUER,
    audience: SESSION_AUDIENCE,
    algorithms: ['HS256'],
  })
  const payload = verified.payload
  if (!payload.jti || typeof payload.wa_id !== 'string' || !isBalcaoFlow(payload.fluxo)) throw new Error('invalid_session_claims')
  const store_id = normalizeStoreId(typeof payload.store_id === 'string' ? payload.store_id : undefined)
  if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number') throw new Error('invalid_session_times')
  return {
    wa_id: normalizeWaId(payload.wa_id),
    ...(store_id ? { store_id } : {}),
    fluxo: payload.fluxo,
    jti: payload.jti,
    exp: payload.exp,
    iat: payload.iat,
  }
}
