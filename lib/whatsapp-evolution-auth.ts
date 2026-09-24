import 'server-only'

import { timingSafeEqual } from 'node:crypto'

export function secretMatches(received: string | null, envName: 'EVOLUTION_WEBHOOK_SECRET' | 'WA_WORKER_SECRET') {
  const expected = process.env[envName]?.trim()
  if (!expected || !received) return false
  const a = Buffer.from(received, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}
