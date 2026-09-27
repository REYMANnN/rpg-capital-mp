import { chooseEanByName } from '@/lib/rafa-ai'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidGtin } from '@/lib/whatsapp-router'

// Descrição da nota sem código de barras ("REFRIG COCA PET 2L") → código de barras exato.
// 1) busca candidatos reais (catálogo da RPG e Open Food Facts, por nome)
// 2) a IA escolhe um candidato só se marca e tamanho baterem; senão diz o que falta
// 3) o código escolhido tem que estar entre os candidatos e ser válido

export type NameCandidate = { ean: string; nome: string; marca?: string; tamanho?: string }
export type NameResolution = { barcode: string; name: string } | { missing: string }

const EXPAND: Record<string, string> = {
  refrig: 'refrigerante', refri: 'refrigerante', lt: 'lata', desn: 'desnatado', integ: 'integral', tp1: 'tipo 1',
  choc: 'chocolate', bisc: 'biscoito', sab: 'sabao', det: 'detergente', amac: 'amaciante', marg: 'margarina',
  cerv: 'cerveja', agua: 'agua', leit: 'leite', macar: 'macarrao', mac: 'macarrao', pap: 'papel', hig: 'higienico',
}
const DROP = new Set(['un', 'und', 'cx', 'fd', 'pct', 'pc', 'kg', 'g', 'ml', 'l', 'c', 'com', 'de', 'da', 'do'])

export function searchTerms(description: string) {
  return description.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => EXPAND[word] || word)
    .filter((word) => !DROP.has(word) && !/^\d+$/.test(word))
    .slice(0, 5)
    .join(' ')
}

async function cacheCandidates(terms: string): Promise<NameCandidate[]> {
  const words = terms.split(' ').filter((word) => word.length >= 4)
  if (!words.length) return []
  const longest = [...words].sort((a, b) => b.length - a.length)[0]
  const { data } = await createAdminClient().from('inventory_v1_product_catalog_cache')
    .select('barcode,name,brand')
    .ilike('name', `%${longest}%`)
    .eq('cache_status', 'hit')
    .limit(15)
  return (data || []).map((row) => ({ ean: String(row.barcode), nome: String(row.name), marca: row.brand ? String(row.brand) : undefined }))
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'RPGCapital-Balcao/1.0 (rpgcapital.com.br)' },
    cache: 'no-store',
    signal: AbortSignal.timeout(6000),
  })
  if (!response.ok) return null
  return response.json().catch(() => null) as Promise<{ products?: OffProduct[]; hits?: OffProduct[] } | null>
}

type OffProduct = { code?: string; product_name?: string; brands?: string | string[]; quantity?: string }

const toCandidate = (product: OffProduct): NameCandidate => ({
  ean: String(product.code),
  nome: String(product.product_name),
  marca: Array.isArray(product.brands) ? product.brands.join(', ') : product.brands ? String(product.brands) : undefined,
  tamanho: product.quantity ? String(product.quantity) : undefined,
})

// Open Food Facts: busca clássica (filtro Brasil) e, se falhar (ela cai com frequência), a busca nova.
async function openFoodFactsCandidates(terms: string): Promise<NameCandidate[]> {
  if (!terms) return []
  try {
    const classic = await fetchJson(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(terms)}&countries_tags_en=brazil&json=1&page_size=8&fields=code,product_name,brands,quantity`).catch(() => null)
    let products: OffProduct[] = classic?.products || []
    if (!products.length) {
      const modern = await fetchJson(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(`${terms} countries_tags:"en:brazil"`)}&page_size=8&fields=code,product_name,brands,quantity`).catch(() => null)
      products = modern?.hits || []
    }
    return products.filter((product) => product?.code && product?.product_name).map(toCandidate)
  } catch {
    return []
  }
}

// items: índice da linha na nota + descrição. Busca externa limitada (Open Food Facts aceita ~10 buscas/min).
export async function resolveNamesToEan(input: {
  storeId: string
  waId: string
  items: Array<{ index: number; description: string }>
  maxExternalSearches?: number
}): Promise<Map<number, NameResolution>> {
  const out = new Map<number, NameResolution>()
  if (!input.items.length) return out
  let external = input.maxExternalSearches ?? 8
  const prepared: Array<{ n: number; descricao: string; candidatos: NameCandidate[] }> = []
  for (const item of input.items.slice(0, 25)) {
    const terms = searchTerms(item.description)
    let candidates = await cacheCandidates(terms).catch(() => [])
    if (candidates.length < 3 && external > 0) {
      external -= 1
      candidates = [...candidates, ...(await openFoodFactsCandidates(terms))]
    }
    const unique = [...new Map(candidates.filter((candidate) => isValidGtin(candidate.ean)).map((candidate) => [candidate.ean, candidate])).values()].slice(0, 10)
    if (!unique.length) { out.set(item.index, { missing: 'não encontrado' }); continue }
    prepared.push({ n: item.index, descricao: item.description, candidatos: unique })
  }
  if (!prepared.length) return out

  const choices = await chooseEanByName({ storeId: input.storeId, waId: input.waId, items: prepared }).catch(() => [])
  for (const item of prepared) {
    const choice = choices.find((entry) => Number(entry.n) === item.n)
    const ean = String(choice?.ean || '').replace(/\D/g, '')
    const candidate = item.candidatos.find((entry) => entry.ean === ean)
    if (choice && candidate && isValidGtin(ean)) {
      out.set(item.n, { barcode: ean, name: String(choice.nome || candidate.nome).slice(0, 120) })
    } else {
      out.set(item.n, { missing: String(choice?.falta || 'marca e tamanho') })
    }
  }
  return out
}
