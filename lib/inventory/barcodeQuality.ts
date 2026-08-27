export type BarcodeSource = 'Quagga2' | 'ZXing-C++/WASM' | 'ZXing-JS'

export type BarcodeCandidate = {
  code: string
  source: BarcodeSource
  format?: string
  seenAt: number
}

export function normalizeBarcode(raw: string) {
  return String(raw || '').replace(/\s+/g, '').trim()
}

export function isDigitsOnly(code: string) {
  return /^\d+$/.test(code)
}

// GS1 check digit validation for GTIN-8, GTIN-12 (UPC-A), GTIN-13 and GTIN-14.
export function hasValidGtinChecksum(code: string) {
  if (!isDigitsOnly(code) || ![8, 12, 13, 14].includes(code.length)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()!
  let sum = 0
  let weight = 3
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += digits[index] * weight
    weight = weight === 3 ? 1 : 3
  }
  return ((10 - (sum % 10)) % 10) === check
}

export function isPlausibleRetailCode(code: string, format?: string) {
  const normalized = normalizeBarcode(code)
  if (!normalized || normalized.length < 6) return false

  const fmt = String(format || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const isRetailGtin = [8, 12, 13, 14].includes(normalized.length) && isDigitsOnly(normalized)

  // UPC-E has its own compressed checksum semantics, so do not reject it using GTIN-8 math.
  if (fmt.includes('upce')) return normalized.length === 8 && isDigitsOnly(normalized)
  if (isRetailGtin) return hasValidGtinChecksum(normalized)

  // Code 128 can legitimately contain letters. It is accepted only after stronger temporal consensus.
  if (fmt.includes('code128') || fmt.includes('code_128')) return normalized.length >= 6

  return normalized.length >= 6
}

export function requiredConfirmations(code: string, source: BarcodeSource, format?: string) {
  const normalized = normalizeBarcode(code)
  const fmt = String(format || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const gtinWithChecksum = [8, 12, 13, 14].includes(normalized.length) && hasValidGtinChecksum(normalized)

  if (source === 'ZXing-C++/WASM' && gtinWithChecksum) return 2
  if (fmt.includes('upce')) return 3
  if (gtinWithChecksum) return 3
  return 4
}

export function countRecentConfirmations(history: BarcodeCandidate[], candidate: BarcodeCandidate, windowMs = 2200) {
  const cutoff = candidate.seenAt - windowMs
  const matching = history
    .filter((item) => item.code === candidate.code && item.seenAt >= cutoff)
    .sort((a, b) => a.seenAt - b.seenAt)

  // Quagga can report the same physical frame through onProcessed and onDetected.
  // Count those as one observation, while still allowing independent engines to
  // corroborate the same code at the same instant.
  const lastBySource = new Map<BarcodeSource, number>()
  let confirmations = 0
  for (const item of matching) {
    const last = lastBySource.get(item.source)
    if (last === undefined || item.seenAt - last >= 75) {
      confirmations += 1
      lastBySource.set(item.source, item.seenAt)
    }
  }
  return confirmations
}

export function runBarcodeQualitySelfTest() {
  const valid = ['7894900011517', '7891000100103', '7896004400754']
  const invalid = ['7894900011518', '7891000100104', '7896004400755']

  const validPass = valid.every(hasValidGtinChecksum)
  const invalidPass = invalid.every((code) => !hasValidGtinChecksum(code))

  const duplicateFrame: BarcodeCandidate[] = [
    { code: valid[0], source: 'Quagga2', format: 'ean_13', seenAt: 1000 },
    { code: valid[0], source: 'Quagga2', format: 'ean_13', seenAt: 1010 },
    { code: valid[0], source: 'Quagga2', format: 'ean_13', seenAt: 1120 },
  ]
  const dedupePass = countRecentConfirmations(duplicateFrame, duplicateFrame[2]) === 2

  return { ok: validPass && invalidPass && dedupePass, validPass, invalidPass, dedupePass }
}
