export const DEFAULT_BANK_PRICE_CENTS = 599
export const DEFAULT_BILLING_BYPASS_EMAIL = 'renanguadalupe05@gmail.com'

export function bankPriceCents() {
  const raw = Number.parseInt(process.env.BILLING_PRICE_PER_BANK_CENTS || '', 10)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_BANK_PRICE_CENTS
}

export const BANK_PRICE_CENTS = bankPriceCents()

export function billingBypassEmails() {
  const configured = (process.env.BILLING_BYPASS_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  return new Set([DEFAULT_BILLING_BYPASS_EMAIL, ...configured])
}

export function isBillingBypassEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase()
  return Boolean(normalized && billingBypassEmails().has(normalized))
}

export function monthlyAmountCents(bankCount: number) {
  const count = Number.isFinite(bankCount) ? Math.max(0, Math.floor(bankCount)) : 0
  return count * BANK_PRICE_CENTS
}
