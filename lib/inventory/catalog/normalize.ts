export function cleanText(raw: unknown): string {
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  if (typeof raw !== 'string') return ''
  return raw.replace(/\s+/g, ' ').trim()
}

export function normalizeBarcode(raw: unknown): string {
  const value = cleanText(raw).replace(/\s+/g, '')
  return /^\d{8,14}$/.test(value) ? value : ''
}

export function cleanStringList(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : [raw]
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const cleaned = cleanText(value)
    if (!cleaned || seen.has(cleaned)) continue
    seen.add(cleaned)
    out.push(cleaned)
  }
  return out
}

export function firstText(...values: unknown[]): string {
  for (const value of values) {
    const cleaned = cleanText(value)
    if (cleaned) return cleaned
  }
  return ''
}

export function finiteNumber(raw: unknown): number | undefined {
  const value = typeof raw === 'number' ? raw : Number(cleanText(raw).replace(',', '.'))
  return Number.isFinite(value) ? value : undefined
}
