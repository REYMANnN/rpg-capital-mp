export type Detection = { rawValue?: string | null; format?: string | null } | null

function validGtin(code: string) {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false
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

export function evaluateDetection(detection: Detection) {
  if (!detection?.rawValue) return { kind: 'miss' } as const

  const code = String(detection.rawValue).replace(/\s+/g, '').trim()
  if (!code) return { kind: 'miss' } as const

  const format = String(detection.format || '').toLowerCase()
  if (['ean_13', 'ean_8', 'upc_a'].includes(format) || /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(code)) {
    return validGtin(code)
      ? { kind: 'accept', code } as const
      : { kind: 'reject', code } as const
  }

  if (format === 'upc_e') {
    return /^\d{8}$/.test(code)
      ? { kind: 'accept', code } as const
      : { kind: 'reject', code } as const
  }

  return code.length >= 6
    ? { kind: 'accept', code } as const
    : { kind: 'reject', code } as const
}
