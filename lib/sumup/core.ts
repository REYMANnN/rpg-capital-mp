// Partes puras da integração SumUp (sem banco, sem 'server-only'), testáveis com node.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// ---------- Assinatura (state do OAuth e URL do webhook) ----------

export function signWith(secret: string, value: string) {
  if (secret.length < 32) throw new Error('segredo de assinatura precisa de 32+ caracteres')
  return createHmac('sha256', secret).update(value).digest('base64url')
}

export function verifyWith(secret: string, value: string, signature: string) {
  const expected = Buffer.from(signWith(secret, value))
  const given = Buffer.from(String(signature || ''))
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export type OAuthState = { storeId: string; userId: string; next: string; exp: number; nonce: string }

export function encodeStateWith(secret: string, input: Omit<OAuthState, 'exp' | 'nonce'>, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ ...input, exp: now + 15 * 60_000, nonce: randomBytes(8).toString('hex') })).toString('base64url')
  return `${payload}.${signWith(secret, payload)}`
}

export function decodeStateWith(secret: string, state: string, now = Date.now()): OAuthState | null {
  const [payload, signature, extra] = String(state || '').split('.')
  if (!payload || !signature || extra !== undefined || !verifyWith(secret, payload, signature)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState
    return parsed && typeof parsed.storeId === 'string' && typeof parsed.userId === 'string' && parsed.exp > now ? parsed : null
  } catch {
    return null
  }
}

// ---------- Corpos das requisições ----------

export type CardType = 'credito' | 'debito'

export function readerCheckoutBody(input: {
  amountCents: number
  cardType: CardType
  installments: number
  description: string
  returnUrl: string
  affiliate: { key: string; app_id: string } | null
  foreignTransactionId: string
}) {
  const installments = input.cardType === 'credito' ? Math.min(12, Math.max(1, Math.round(input.installments || 1))) : 1
  return {
    total_amount: { currency: 'BRL', minor_unit: 2, value: Math.round(input.amountCents) },
    // No Brasil a SumUp exige dizer se é crédito ou débito.
    card_type: input.cardType === 'credito' ? 'credit' : 'debit',
    ...(installments > 1 ? { installments } : {}),
    description: input.description.slice(0, 120),
    return_url: input.returnUrl,
    ...(input.affiliate ? { affiliate: { ...input.affiliate, foreign_transaction_id: input.foreignTransactionId } } : {}),
  }
}

export function normalizePairingCode(code: string) {
  const clean = String(code || '').replace(/[\s-]/g, '').toUpperCase()
  return /^[A-Z0-9]{8,9}$/.test(clean) ? clean : null
}

export function pairReaderBody(code: string, name: string) {
  return { pairing_code: code, name: name.slice(0, 500) }
}

export const SUMUP_PATHS = {
  memberships: '/v0.1/memberships',
  readers: (merchant: string) => `/v0.1/merchants/${merchant}/readers`,
  checkout: (merchant: string, reader: string) => `/v0.1/merchants/${merchant}/readers/${reader}/checkout`,
  terminate: (merchant: string, reader: string) => `/v0.1/merchants/${merchant}/readers/${reader}/terminate`,
  transaction: (merchant: string, clientTransactionId: string) => `/v2.1/merchants/${merchant}/transactions?client_transaction_id=${encodeURIComponent(clientTransactionId)}`,
}

// Primeira conta de comerciante ativa do usuário (memberships), no formato da SumUp.
export function merchantCodeFromMemberships(json: unknown): string | null {
  const items = Array.isArray((json as { items?: unknown })?.items) ? (json as { items: Array<Record<string, unknown>> }).items : []
  const merchant = items.find((item) => item.type === 'merchant' && (item.status === 'accepted' || !item.status))
  const code = merchant?.resource_id
  return typeof code === 'string' && code ? code : null
}
