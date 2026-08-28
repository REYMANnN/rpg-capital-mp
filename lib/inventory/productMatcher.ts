export type ProductCandidate = {
  barcode: string
  name: string
  brand?: string
  imageUrl?: string
  source?: string
}

const WORDS: Array<[RegExp, string]> = [
  [/\brefr?i\b/g, 'refrigerante'],
  [/\brefrig\b/g, 'refrigerante'],
  [/\bcond\b/g, 'condensado'],
  [/\bc\/\b/g, 'com'],
  [/\bgrs?\b/g, 'g'],
  [/\bgramas?\b/g, 'g'],
  [/\bkgs?\b/g, 'kg'],
  [/\blts?\b/g, 'l'],
  [/\blitros?\b/g, 'l'],
  [/\bmililitros?\b/g, 'ml'],
  [/\bunids?\b/g, 'un'],
  [/\bunidades?\b/g, 'un'],
  [/\bpet\b/g, 'pet'],
]

export function normalizeProductName(value: string | null | undefined) {
  let text = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/coca[\s._-]*cola/g, 'coca cola')
    .replace(/([a-z])(?=\d)/g, '$1 ')
    .replace(/(\d)(?=[a-z])/g, '$1 ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  for (const [pattern, replacement] of WORDS) text = text.replace(pattern, replacement)
  return text.replace(/\s+/g, ' ').trim()
}

function tokens(value: string) {
  return normalizeProductName(value).split(' ').filter(Boolean)
}

function diceTokens(a: string, b: string) {
  const left = tokens(a)
  const right = tokens(b)
  if (!left.length || !right.length) return 0
  const remaining = [...right]
  let matches = 0
  for (const token of left) {
    const index = remaining.indexOf(token)
    if (index >= 0) {
      matches += 1
      remaining.splice(index, 1)
    }
  }
  return (2 * matches) / (left.length + right.length)
}

function trigrams(value: string) {
  const compact = normalizeProductName(value).replace(/\s+/g, ' ')
  if (compact.length < 3) return new Set([compact])
  const result = new Set<string>()
  for (let index = 0; index <= compact.length - 3; index += 1) result.add(compact.slice(index, index + 3))
  return result
}

function diceTrigrams(a: string, b: string) {
  const left = trigrams(a)
  const right = trigrams(b)
  if (!left.size || !right.size) return 0
  let matches = 0
  for (const part of left) if (right.has(part)) matches += 1
  return (2 * matches) / (left.size + right.size)
}

type Measure = { kind: 'mass' | 'volume'; base: number }

function extractMeasure(value: string): Measure | null {
  const normalized = normalizeProductName(value)
  const match = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b/)
  if (!match) return null
  const amount = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(amount)) return null
  if (match[2] === 'kg') return { kind: 'mass', base: amount * 1000 }
  if (match[2] === 'g') return { kind: 'mass', base: amount }
  if (match[2] === 'l') return { kind: 'volume', base: amount * 1000 }
  return { kind: 'volume', base: amount }
}

function measureScore(a: string, b: string) {
  const left = extractMeasure(a)
  const right = extractMeasure(b)
  if (!left || !right) return { bonus: 0, penalty: 0 }
  if (left.kind !== right.kind) return { bonus: 0, penalty: 0.35 }
  const difference = Math.abs(left.base - right.base) / Math.max(left.base, right.base, 1)
  if (difference <= 0.01) return { bonus: 0.2, penalty: 0 }
  return { bonus: 0, penalty: 0.3 }
}

export function scoreProductCandidate(invoiceDescription: string, candidateName: string) {
  const token = diceTokens(invoiceDescription, candidateName)
  const chars = diceTrigrams(invoiceDescription, candidateName)
  const measure = measureScore(invoiceDescription, candidateName)
  const raw = (token * 0.65) + (chars * 0.15) + measure.bonus - measure.penalty
  return Math.max(0, Math.min(1, Number(raw.toFixed(4))))
}

export function rankProductCandidates(description: string, candidates: ProductCandidate[]) {
  return candidates
    .map((candidate) => ({ candidate, score: scoreProductCandidate(description, `${candidate.brand || ''} ${candidate.name}`.trim()) }))
    .sort((a, b) => b.score - a.score)
}

export function pickBestProductCandidate(description: string, candidates: ProductCandidate[]) {
  const ranked = rankProductCandidates(description, candidates)
  const best = ranked[0]
  if (!best || best.score < 0.72) return null
  const second = ranked[1]
  if (second && best.score - second.score < 0.08) return null
  return best
}
