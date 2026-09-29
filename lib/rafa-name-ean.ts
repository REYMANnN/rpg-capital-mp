import { chooseEanByName, guessEansByName } from '@/lib/rafa-ai'
import { resolveUniversalProduct } from '@/lib/inventory/catalog/resolver'
import { detectBrand } from '@/lib/rafa-brands'
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

function sizeTerm(description: string) {
  const normalized = description.toLowerCase().replace(',', '.')
  const match = normalized.match(/\b\d+(?:\.\d+)?\s*(?:kg|g|ml|l|un)\b/) || normalized.match(/\bc\/?\s*\d+\b/)
  return match ? match[0].replace(/\s+/g, '') : ''
}

function productType(terms: string, brand: string | null) {
  const brandWords = new Set(String(brand || '').split(' ').filter(Boolean))
  return terms.split(' ').find((word) => word.length >= 3 && !brandWords.has(word)) || ''
}

function rowsToCandidates(rows: any[] | null | undefined): NameCandidate[] {
  return (rows || []).map((row) => ({ ean: String(row.barcode), nome: String(row.name), marca: row.brand ? String(row.brand) : undefined }))
}

async function cacheCandidates(terms: string, brand: string | null, type: string): Promise<NameCandidate[]> {
  const admin = createAdminClient()
  const all: NameCandidate[] = []
  if (brand && type) {
    const { data } = await admin.from('inventory_v1_product_catalog_cache')
      .select('barcode,name,brand').ilike('name', `%${brand}%`).ilike('name', `%${type}%`).eq('cache_status', 'hit').limit(25)
    all.push(...rowsToCandidates(data))
  }
  if (brand && all.length < 25) {
    const { data } = await admin.from('inventory_v1_product_catalog_cache')
      .select('barcode,name,brand').ilike('name', `%${brand}%`).eq('cache_status', 'hit').limit(25)
    all.push(...rowsToCandidates(data))
  }
  if (all.length < 25) {
    const words = terms.split(' ').filter((word) => word.length >= 4)
    const longest = [...words].sort((a, b) => b.length - a.length)[0]
    if (longest) {
      const { data } = await admin.from('inventory_v1_product_catalog_cache')
        .select('barcode,name,brand').ilike('name', `%${longest}%`).eq('cache_status', 'hit').limit(25)
      all.push(...rowsToCandidates(data))
    }
  }
  return [...new Map(all.map((candidate) => [candidate.ean, candidate])).values()].slice(0, 25)
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

// Tamanho da descrição bate com o nome do produto achado? ("2L" x "2 litros"/"2000ml"; "500G" x "500 g")
function sizeMatches(description: string, name: string) {
  const size = sizeTerm(description)
  if (!size) return true
  const value = Number(size.replace(/[a-z]+$/, ''))
  const unit = size.replace(/^[\d.]+/, '')
  const flat = name.toLowerCase().replace(',', '.').replace(/\s+/g, '').replace(/litros?/g, 'l').replace(/gramas?/g, 'g')
  const want = unit === 'l' ? [`${value}l`, `${value * 1000}ml`] : unit === 'kg' ? [`${value}kg`, `${value * 1000}g`]
    : unit === 'ml' ? [`${value}ml`, `${value / 1000}l`] : unit === 'g' ? [`${value}g`, `${value / 1000}kg`] : [size]
  return want.some((item) => flat.includes(item))
}

function plain(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// O produto achado na base (pelo código) é o da nota? Marca (ou uma palavra forte) tem que aparecer,
// e se a base disser o tamanho, o tamanho tem que bater.
function lookupConfirms(description: string, lookupText: string, guessName: string) {
  const text = plain(lookupText)
  if (!text.trim()) return false
  const brand = detectBrand(description) || detectBrand(guessName)
  const words = searchTerms(description).split(' ').filter((word) => word.length >= 4)
  const brandHit = brand ? plain(brand).split(' ').some((word) => word.length >= 3 && text.includes(word)) : false
  const wordHit = words.some((word) => text.includes(word.slice(0, 5)))
  if (!brandHit && !wordHit) return false
  const hasSize = /\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|litros?)\b/.test(text)
  return !hasSize || sizeMatches(description, lookupText)
}

export type NameEanDebug = { descricao: string; palpites: string[]; confirmados: string[] }

// Palpites de EAN da IA conferidos numa base real de produtos: só vale o código que existe
// e cujo produto tem a marca/nome e o tamanho da nota.
async function verifiedGuesses(input: { storeId: string; waId: string; items: Array<{ index: number; description: string }>; debug?: NameEanDebug[] }) {
  const out = new Map<number, NameCandidate[]>()
  const guesses = await guessEansByName({ storeId: input.storeId, waId: input.waId, items: input.items.map((item) => ({ n: item.index, descricao: item.description })) }).catch(() => [])
  const jobs: Array<{ index: number; description: string; ean: string; nome: string }> = []
  for (const guess of guesses) {
    const item = input.items.find((row) => row.index === Number(guess.n))
    if (!item) continue
    const options = [...(guess.opcoes || []), ...(guess.eans || []).map((ean) => ({ ean, nome: '' }))]
    for (const option of options.slice(0, 3)) {
      const ean = String(option?.ean || '').replace(/\D/g, '')
      if (isValidGtin(ean)) jobs.push({ index: item.index, description: item.description, ean, nome: String(option?.nome || '') })
    }
  }
  const debugBy = new Map<number, NameEanDebug>()
  for (const item of input.items) debugBy.set(item.index, { descricao: item.description, palpites: jobs.filter((job) => job.index === item.index).map((job) => job.ean), confirmados: [] })
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]
      const found = await resolveUniversalProduct(job.ean, { totalDeadlineMs: 5000 }).catch(() => null)
      if (!found?.found) continue
      const product = found.product as { name?: string; brand?: string; description?: string } | undefined
      const lookupText = [product?.name, product?.brand, product?.description].filter(Boolean).join(' ')
      if (!lookupConfirms(job.description, lookupText, job.nome)) continue
      const name = job.nome && job.nome.length >= String(product?.name || '').length ? job.nome : String(product?.name || job.nome)
      const list = out.get(job.index) || []
      list.push({ ean: job.ean, nome: name, marca: product?.brand ? String(product.brand) : undefined })
      out.set(job.index, list)
      debugBy.get(job.index)?.confirmados.push(`${job.ean} ${String(product?.name || '')}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, jobs.length) }, worker))
  input.debug?.push(...debugBy.values())
  return out
}

// items: índice da linha na nota + descrição. Busca externa limitada (Open Food Facts aceita ~10 buscas/min).
export async function resolveNamesToEan(input: {
  storeId: string
  waId: string
  items: Array<{ index: number; description: string; lineValueCents?: number }>
  maxExternalSearches?: number
  debug?: NameEanDebug[]
}): Promise<Map<number, NameResolution>> {
  const out = new Map<number, NameResolution>()
  if (!input.items.length) return out
  let external = input.maxExternalSearches ?? 10
  const prepared: Array<{ n: number; descricao: string; marca_detectada: string | null; candidatos: NameCandidate[] }> = []
  const ordered = [...input.items].sort((a, b) => Number(b.lineValueCents || 0) - Number(a.lineValueCents || 0)).slice(0, 40)
  const verified = await verifiedGuesses({ storeId: input.storeId, waId: input.waId, items: ordered, debug: input.debug }).catch(() => new Map<number, NameCandidate[]>())
  for (const item of ordered) {
    const sure = verified.get(item.index) || []
    // Palpite conferido na base com nome e tamanho batendo: é esse o produto.
    if (sure.length >= 1) {
      out.set(item.index, { barcode: sure[0].ean, name: sure[0].nome.slice(0, 120) })
      continue
    }
    const terms = searchTerms(item.description)
    const brand = detectBrand(item.description)
    const type = productType(terms, brand)
    let candidates = [...sure, ...(await cacheCandidates(terms, brand, type).catch(() => []))]
    if (candidates.length < 3 && external > 0) {
      external -= 1
      const query = [brand, type, sizeTerm(item.description)].filter(Boolean).join(' ') || terms
      candidates = [...candidates, ...(await openFoodFactsCandidates(query))]
    }
    const unique = [...new Map(candidates.filter((candidate) => isValidGtin(candidate.ean)).map((candidate) => [candidate.ean, candidate])).values()].slice(0, 25)
    if (!unique.length) { out.set(item.index, { missing: brand ? 'nao_encontrado' : 'sem_marca' }); continue }
    prepared.push({ n: item.index, descricao: item.description, marca_detectada: brand, candidatos: unique })
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
      const allowed = new Set(['tamanho', 'nao_encontrado', 'sem_marca'])
      let missing = String(choice?.falta || (item.marca_detectada ? 'nao_encontrado' : 'sem_marca'))
      if (!allowed.has(missing)) missing = item.marca_detectada ? 'nao_encontrado' : 'sem_marca'
      if (item.marca_detectada && missing === 'sem_marca') missing = 'nao_encontrado'
      out.set(item.n, { missing })
    }
  }
  return out
}
