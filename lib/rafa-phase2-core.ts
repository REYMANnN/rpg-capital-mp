export const RAFA_FIELD_CONFIDENCE_THRESHOLD = 0.85

export type RafaConfirmationGate =
  | 'confirm'
  | 'reject'
  | 'requires_button'
  | 'expired'
  | 'revalidate'
  | 'none'

export function normalizedRafaText(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function isTextConfirmationAttempt(text: string) {
  return ['sim', 'ss', 'isso', 'pode'].includes(normalizedRafaText(text))
}

export function rafaConfirmationGate(input: {
  buttonId?: string | null
  text?: string | null
  expiresAt: string
  nowMs?: number
  hasStateMismatch?: boolean
}): RafaConfirmationGate {
  if (input.buttonId === 'confirm_no') return 'reject'
  if (input.buttonId !== 'confirm_yes') {
    return input.text && isTextConfirmationAttempt(input.text) ? 'requires_button' : 'none'
  }
  const now = input.nowMs ?? Date.now()
  if (new Date(input.expiresAt).getTime() <= now) return 'expired'
  if (input.hasStateMismatch) return 'revalidate'
  return 'confirm'
}

export function rafaAudioDurationDisposition(seconds: number) {
  return Number.isFinite(seconds) && seconds > 120 ? 'too_long' as const : 'ok' as const
}

export function rafaFieldNeedsReview(confidence: number | null | undefined) {
  return !Number.isFinite(Number(confidence)) || Number(confidence) < RAFA_FIELD_CONFIDENCE_THRESHOLD
}

export const RAFA_PRODUCT_RESOLUTION_ORDER = [
  'ean',
  'supplier_product_map',
  'store_similarity',
  'catalog',
  'merchant_disambiguation',
] as const
