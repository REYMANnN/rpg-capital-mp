export const DEMO_NFE_ACCESS_KEY = '35260812345678000190550010009000011123456783'

export function normalizeNfeAccessKey(value: string | null | undefined) {
  return String(value ?? '').replace(/\D+/g, '')
}

function calculateCheckDigit(key43: string) {
  if (!/^\d{43}$/.test(key43)) return -1
  const weights = [2, 3, 4, 5, 6, 7, 8, 9]
  let sum = 0
  for (let index = 0; index < 43; index += 1) {
    const digit = Number(key43[42 - index])
    sum += digit * weights[index % weights.length]
  }
  const candidate = 11 - (sum % 11)
  return candidate >= 10 ? 0 : candidate
}

export function isValidNfeAccessKey(value: string | null | undefined) {
  const key = normalizeNfeAccessKey(value)
  if (!/^\d{44}$/.test(key)) return false
  return calculateCheckDigit(key.slice(0, 43)) === Number(key[43])
}
