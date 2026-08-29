export type ProviderBudgetReason = 'busy' | 'spacing' | 'daily_limit'

export type ProviderBudgetLease = {
  allowed: boolean
  reason?: ProviderBudgetReason
  release?: () => void
}

export type ProviderBudget = {
  tryAcquire: () => ProviderBudgetLease
  snapshot: () => { day: string; attempts: number; inFlight: number; lastStartedAt: number | null }
}

function utcDay(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

export function createProviderBudget(options: {
  dailyLimit: number
  minSpacingMs: number
  maxConcurrent: number
  now?: () => number
}): ProviderBudget {
  const now = options.now ?? Date.now
  let day = utcDay(now())
  let attempts = 0
  let inFlight = 0
  let lastStartedAt: number | null = null

  function refreshDay(current: number) {
    const nextDay = utcDay(current)
    if (nextDay === day) return
    day = nextDay
    attempts = 0
    lastStartedAt = null
  }

  return {
    tryAcquire() {
      const current = now()
      refreshDay(current)
      if (inFlight >= Math.max(1, options.maxConcurrent)) return { allowed: false, reason: 'busy' }
      if (attempts >= Math.max(0, options.dailyLimit)) return { allowed: false, reason: 'daily_limit' }
      if (lastStartedAt !== null && current - lastStartedAt < Math.max(0, options.minSpacingMs)) {
        return { allowed: false, reason: 'spacing' }
      }

      attempts += 1
      inFlight += 1
      lastStartedAt = current
      let released = false
      return {
        allowed: true,
        release() {
          if (released) return
          released = true
          inFlight = Math.max(0, inFlight - 1)
        },
      }
    },
    snapshot() {
      const current = now()
      refreshDay(current)
      return { day, attempts, inFlight, lastStartedAt }
    },
  }
}

export const upcItemDbBudget = createProviderBudget({
  dailyLimit: 100,
  minSpacingMs: 10_000,
  maxConcurrent: 1,
})
