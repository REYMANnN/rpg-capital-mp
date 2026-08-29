import { cleanStringList, cleanText, normalizeBarcode } from '../normalize'
import type { CatalogCandidate, CatalogProvider, ProviderAttempt } from '../types'

export type JsonRecord = Record<string, unknown>

export function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

export function firstRecord(...values: unknown[]): JsonRecord | null {
  for (const value of values) {
    const record = asRecord(value)
    if (record) return record
  }
  return null
}

export function pickText(record: JsonRecord | null, ...keys: string[]): string {
  if (!record) return ''
  for (const key of keys) {
    const value = cleanText(record[key])
    if (value) return value
  }
  return ''
}

export function pickNumber(record: JsonRecord | null, ...keys: string[]): number | undefined {
  if (!record) return undefined
  for (const key of keys) {
    const raw = record[key]
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    const text = cleanText(raw).replace(',', '.')
    if (text && Number.isFinite(Number(text))) return Number(text)
  }
  return undefined
}

export function pickStringList(record: JsonRecord | null, ...keys: string[]): string[] {
  if (!record) return []
  for (const key of keys) {
    const raw = record[key]
    if (Array.isArray(raw)) {
      const strings = raw.flatMap((item) => {
        if (typeof item === 'string') return [item]
        const nested = asRecord(item)
        return nested ? [pickText(nested, 'url', 'src', 'image', 'image_url')] : []
      })
      const cleaned = cleanStringList(strings)
      if (cleaned.length) return cleaned
    }
    const cleaned = cleanStringList(raw)
    if (cleaned.length) return cleaned
  }
  return []
}

export function normalizeConfidence(value: unknown): number | undefined {
  const raw = typeof value === 'number' ? value : Number(cleanText(value).replace('%', '').replace(',', '.'))
  if (!Number.isFinite(raw)) return undefined
  const normalized = raw > 1 ? raw / 100 : raw
  return Math.max(0, Math.min(1, Number(normalized.toFixed(3))))
}

type FetchProviderOptions = {
  provider: CatalogProvider
  barcode: string
  url: string
  normalize: (barcode: string, payload: unknown) => CatalogCandidate | null
  headers?: Record<string, string>
  timeoutMs?: number
  signal?: AbortSignal
}

export async function fetchJsonProvider(options: FetchProviderOptions): Promise<ProviderAttempt> {
  const started = Date.now()
  const code = normalizeBarcode(options.barcode)
  if (!code) {
    return { provider: options.provider, outcome: 'invalid_response', durationMs: 0, error: 'invalid_barcode' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 3000)
  const abortFromParent = () => controller.abort()
  options.signal?.addEventListener('abort', abortFromParent, { once: true })

  try {
    const response = await fetch(options.url, {
      method: 'GET',
      headers: options.headers,
      signal: controller.signal,
      cache: 'no-store',
    })
    const durationMs = Date.now() - started

    if (response.status === 404) return { provider: options.provider, outcome: 'miss', durationMs, status: response.status }
    if (response.status === 429) return { provider: options.provider, outcome: 'rate_limited', durationMs, status: response.status }
    if (!response.ok) return { provider: options.provider, outcome: 'unavailable', durationMs, status: response.status }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return { provider: options.provider, outcome: 'invalid_response', durationMs, status: response.status }
    }

    const candidate = options.normalize(code, payload)
    return candidate
      ? { provider: options.provider, outcome: 'hit', durationMs, status: response.status, candidate }
      : { provider: options.provider, outcome: 'miss', durationMs, status: response.status }
  } catch (error) {
    const durationMs = Date.now() - started
    if (controller.signal.aborted) {
      return { provider: options.provider, outcome: 'timeout', durationMs, error: 'aborted' }
    }
    return {
      provider: options.provider,
      outcome: 'unavailable',
      durationMs,
      error: error instanceof Error ? error.message : 'network_error',
    }
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromParent)
  }
}
