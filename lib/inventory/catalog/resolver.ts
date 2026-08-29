import { mergeCatalogCandidates } from './merge'
import { normalizeBarcode } from './normalize'
import { upcItemDbBudget } from './budget'
import type { CatalogCandidate, CatalogLookup, CatalogResolveResult, ProviderAttempt } from './types'
import { lookupOpenFacts } from './providers/openFacts'
import { lookupProductGuru } from './providers/productGuru'
import { lookupGtinSearch } from './providers/gtinSearch'
import { lookupProdutoXyz } from './providers/produtoXyz'
import { lookupEanPictures } from './providers/eanPictures'
import { lookupBrocade } from './providers/brocade'
import { lookupBarcodeFinder } from './providers/barcodeFinder'
import { lookupUpcItemDb } from './providers/upcItemDb'

export type ResolverDependencies = {
  waveA?: CatalogLookup[]
  waveB?: CatalogLookup[]
  now?: () => number
}

async function guardedUpcItemDb(barcode: string, signal?: AbortSignal): Promise<ProviderAttempt> {
  const lease = upcItemDbBudget.tryAcquire()
  if (!lease.allowed) {
    return {
      provider: 'UPCitemdb',
      outcome: 'rate_limited',
      durationMs: 0,
      error: `local_budget:${lease.reason ?? 'blocked'}`,
    }
  }
  try {
    return await lookupUpcItemDb(barcode, signal)
  } finally {
    lease.release?.()
  }
}

const DEFAULT_WAVE_A: CatalogLookup[] = [
  lookupOpenFacts,
  lookupProductGuru,
  lookupGtinSearch,
  lookupProdutoXyz,
  lookupEanPictures,
  lookupBrocade,
]

const DEFAULT_WAVE_B: CatalogLookup[] = [lookupBarcodeFinder, guardedUpcItemDb]

function candidatesFrom(attempts: ProviderAttempt[]): CatalogCandidate[] {
  return attempts.flatMap((attempt) => attempt.outcome === 'hit' && attempt.candidate ? [attempt.candidate] : [])
}

async function runWave(
  lookups: CatalogLookup[],
  barcode: string,
  controller: AbortController,
  deadlineAt: number,
  now: () => number,
): Promise<ProviderAttempt[]> {
  if (!lookups.length || controller.signal.aborted) return []
  const remaining = Math.max(0, deadlineAt - now())
  if (remaining <= 0) {
    controller.abort()
    return []
  }

  const slots: Array<ProviderAttempt | undefined> = new Array(lookups.length)
  const tasks = lookups.map(async (lookup, index) => {
    try {
      slots[index] = await lookup(barcode, controller.signal)
    } catch (error) {
      slots[index] = {
        provider: 'BALCAO',
        outcome: 'unavailable',
        durationMs: 0,
        error: error instanceof Error ? error.message : 'provider_threw',
      }
    }
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    Promise.allSettled(tasks),
    new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        controller.abort()
        resolve()
      }, remaining)
    }),
  ])
  if (timer) clearTimeout(timer)
  if (controller.signal.aborted) await Promise.resolve()
  return slots.filter((value): value is ProviderAttempt => Boolean(value))
}

export async function resolveUniversalProduct(
  rawBarcode: string,
  options?: { totalDeadlineMs?: number; dependencies?: ResolverDependencies },
): Promise<CatalogResolveResult> {
  const barcode = normalizeBarcode(rawBarcode)
  if (!barcode) return { found: false, barcode: '', attempts: [] }

  const dependencies = options?.dependencies
  const now = dependencies?.now ?? Date.now
  const totalDeadlineMs = Math.max(1, options?.totalDeadlineMs ?? 4_500)
  const deadlineAt = now() + totalDeadlineMs
  const controller = new AbortController()

  const waveA = dependencies?.waveA ?? DEFAULT_WAVE_A
  const waveB = dependencies?.waveB ?? DEFAULT_WAVE_B
  const attemptsA = await runWave(waveA, barcode, controller, deadlineAt, now)
  const candidatesA = candidatesFrom(attemptsA)
  const productA = mergeCatalogCandidates(barcode, candidatesA)

  if (productA) {
    return { found: true, barcode, product: productA, attempts: attemptsA }
  }

  if (controller.signal.aborted || now() >= deadlineAt) {
    return { found: false, barcode, attempts: attemptsA }
  }

  const attemptsB = await runWave(waveB, barcode, controller, deadlineAt, now)
  const attempts = [...attemptsA, ...attemptsB]
  const product = mergeCatalogCandidates(barcode, [...candidatesA, ...candidatesFrom(attemptsB)])
  return product
    ? { found: true, barcode, product, attempts }
    : { found: false, barcode, attempts }
}
