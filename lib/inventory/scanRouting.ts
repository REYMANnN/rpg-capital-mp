import { isValidNfeAccessKey, normalizeNfeAccessKey } from './nfeKey'

export type ShelfScanRoute =
  | { kind: 'nfe'; key: string }
  | { kind: 'ean'; code: string }
  | { kind: 'invalid'; raw: string }

function isValidGtin(value: string) {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false
  const digits = [...value].map(Number)
  const check = digits.pop()!
  let sum = 0
  for (let index = digits.length - 1, position = 0; index >= 0; index -= 1, position += 1) {
    sum += digits[index] * (position % 2 === 0 ? 3 : 1)
  }
  return (10 - (sum % 10)) % 10 === check
}

export function extractNfeAccessKey(raw: string) {
  const text = String(raw || '').trim()
  const direct = normalizeNfeAccessKey(/^\d{44}$/.test(text) ? text : '')
  if (direct && isValidNfeAccessKey(direct)) return direct

  const candidates = text.match(/(?<!\d)\d{44}(?!\d)/g) || []
  for (const candidate of candidates) {
    if (isValidNfeAccessKey(candidate)) return candidate
  }

  try {
    const url = new URL(text)
    for (const key of ['p', 'chNFe', 'chave', 'key']) {
      const value = url.searchParams.get(key)
      if (!value) continue
      const candidate = String(value).split('|')[0].replace(/\D/g, '')
      if (isValidNfeAccessKey(candidate)) return candidate
    }
  } catch {}

  return null
}

export function routeShelfScan(raw: string): ShelfScanRoute {
  const text = String(raw || '').trim()
  const key = extractNfeAccessKey(text)
  if (key) return { kind: 'nfe', key }

  if (/^\d+$/.test(text) && isValidGtin(text)) return { kind: 'ean', code: text }
  return { kind: 'invalid', raw: text }
}
