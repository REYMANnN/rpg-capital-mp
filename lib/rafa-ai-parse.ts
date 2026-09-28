// Funções puras da camada de IA da Rafa (sem rede, sem banco): testáveis com node --test.

// ---------- Áudio ----------

// A Groq decide o formato pela EXTENSÃO do arquivo e só aceita:
// flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm.
// A Evolution nomeia o áudio do WhatsApp como "<id>.oga" (mime-types traduz audio/ogg → oga),
// e a Groq recusa. Aqui a extensão é sempre derivada do mime e forçada para uma aceita.
const GROQ_AUDIO_EXTENSIONS = new Set(['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm'])

export function groqAudioExtension(mime: string | null | undefined, filename?: string | null): string {
  const m = String(mime || '').toLowerCase().split(';')[0].trim()
  if (m.includes('ogg') || m.includes('opus')) return 'ogg'
  if (m === 'audio/mpeg' || m === 'audio/mp3') return 'mp3'
  if (m === 'audio/mp4' || m === 'audio/aac' || m === 'audio/x-m4a' || m === 'audio/m4a') return 'm4a'
  if (m.includes('wav')) return 'wav'
  if (m.includes('webm')) return 'webm'
  if (m.includes('flac')) return 'flac'
  const ext = String(filename || '').toLowerCase().split('.').pop() || ''
  if (ext === 'oga' || ext === 'opus') return 'ogg'
  if (GROQ_AUDIO_EXTENSIONS.has(ext)) return ext
  return 'ogg' // áudio do WhatsApp é OGG/Opus na prática
}

export function groqAudioFilename(mime: string | null | undefined, filename?: string | null): string {
  const ext = groqAudioExtension(mime, filename)
  const base = String(filename || 'audio').replace(/\.[^./\\]*$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60) || 'audio'
  return `${base}.${ext}`
}

export function groqAudioMime(mime: string | null | undefined, filename?: string | null): string {
  const ext = groqAudioExtension(mime, filename)
  return ext === 'ogg' ? 'audio/ogg'
    : ext === 'mp3' ? 'audio/mpeg'
      : ext === 'm4a' ? 'audio/mp4'
        : `audio/${ext}`
}

// ---------- JSON da IA ----------

// Lê JSON devolvido por modelo mesmo com "ruído": bloco <think>, cercas ```json, texto antes/depois.
export function parseModelJson<T = unknown>(raw: unknown): T | null {
  if (raw && typeof raw === 'object') return raw as T
  if (typeof raw !== 'string') return null
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  try { return JSON.parse(text) as T } catch {}
  const start = text.indexOf('{')
  if (start < 0) return null
  // Primeiro objeto balanceado, respeitando strings.
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)) as T } catch { return null }
      }
    }
  }
  return null
}

// ---------- Nota fiscal ----------

export type InvoiceItem = {
  description?: string | null
  supplier_code?: string | null
  ean?: string | null
  quantity?: number | null
  unit_cost_cents?: number | null
  total_cents?: number | null
  unit_package?: string | null
  confidence: { product: number; quantity: number; cost: number }
}

export type InvoiceExtraction = {
  supplier_name?: string | null
  supplier_cnpj?: string | null
  items: InvoiceItem[]
}

const ITEM_LIST_KEYS = ['items', 'itens', 'i', 'lines', 'linhas', 'produtos', 'products', 'det']

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key]
  }
  return undefined
}

function str(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const s = String(value).trim()
  return s ? s : null
}

// "1.234,56" / "1234.56" / 1234.56 → número
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  let s = value.trim().replace(/[^\d.,-]/g, '')
  if (!s) return null
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function cents(centsValue: unknown, reaisValue: unknown): number | null {
  const c = toNumber(centsValue)
  if (c !== null) {
    // Modelo às vezes manda reais no campo de centavos ("29.9"): número não inteiro = reais.
    return Number.isInteger(c) ? c : Math.round(c * 100)
  }
  const r = toNumber(reaisValue)
  return r === null ? null : Math.round(r * 100)
}

// Confiança ausente = 0.9 (acima do corte de 0.85 do plano da nota), como o comportamento antigo (?? 1).
function conf(value: unknown, fallback: number): number {
  const n = toNumber(value)
  if (n === null) return fallback
  return Math.min(1, Math.max(0, n > 1 ? n / 100 : n))
}

function findItemList(obj: Record<string, unknown>, depth = 0): unknown[] | null {
  for (const key of ITEM_LIST_KEYS) if (Array.isArray(obj[key])) return obj[key] as unknown[]
  if (depth >= 2) return null
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const found = findItemList(value as Record<string, unknown>, depth + 1)
      if (found) return found
    }
  }
  return null
}

function normalizeItem(raw: unknown): InvoiceItem | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const c = (o.confidence ?? o.confianca ?? o.cf) as Record<string, unknown> | number | undefined
  const cObj = c && typeof c === 'object' ? c : {}
  const cAll = typeof c === 'number' ? conf(c, 0.9) : null
  const item: InvoiceItem = {
    description: str(pick(o, ['description', 'descricao', 'd', 'nome', 'xProd', 'produto'])),
    supplier_code: str(pick(o, ['supplier_code', 'codigo', 'sc', 'cProd', 'cod'])),
    ean: str(pick(o, ['ean', 'e', 'cEAN', 'gtin', 'codigo_barras'])),
    quantity: toNumber(pick(o, ['quantity', 'quantidade', 'q', 'qCom', 'qtd'])),
    unit_cost_cents: cents(pick(o, ['unit_cost_cents', 'vu']), pick(o, ['unit_cost', 'valor_unitario', 'vUnCom', 'preco_unitario', 'custo_reais'])),
    total_cents: cents(pick(o, ['total_cents', 'vt']), pick(o, ['total', 'valor_total', 'vProd'])),
    unit_package: str(pick(o, ['unit_package', 'unidade', 'u', 'uCom', 'un'])),
    confidence: {
      product: cAll ?? conf(pick(cObj as Record<string, unknown>, ['product', 'produto', 'p']) ?? o.cp, 0.9),
      quantity: cAll ?? conf(pick(cObj as Record<string, unknown>, ['quantity', 'quantidade', 'q']) ?? o.cq, 0.9),
      cost: cAll ?? conf(pick(cObj as Record<string, unknown>, ['cost', 'custo', 'c']) ?? o.cc, 0.9),
    },
  }
  if (item.ean) {
    const digits = item.ean.replace(/\D/g, '')
    item.ean = [8, 12, 13, 14].includes(digits.length) ? digits : null
  }
  if (!item.description && !item.supplier_code && !item.ean) return null
  return item
}

// Aceita o formato que a IA devolver (items/itens/lines, chaves curtas ou longas, reais ou centavos).
export function normalizeInvoiceExtraction(raw: unknown): InvoiceExtraction {
  const obj = (parseModelJson<Record<string, unknown>>(raw) || {}) as Record<string, unknown>
  const header = (obj.emitente ?? obj.fornecedor ?? obj.emit) as Record<string, unknown> | undefined
  const h = header && typeof header === 'object' ? header : {}
  const list = findItemList(obj) || []
  const cnpjRaw = str(pick(obj, ['supplier_cnpj', 'cnpj']) ?? pick(h, ['cnpj', 'CNPJ']))
  return {
    supplier_name: str(pick(obj, ['supplier_name', 'fornecedor_nome', 'f', 'nome_fornecedor']) ?? pick(h, ['nome', 'xNome', 'name'])),
    supplier_cnpj: cnpjRaw ? cnpjRaw.replace(/\D/g, '') || null : null,
    items: list.map(normalizeItem).filter((item): item is InvoiceItem => item !== null),
  }
}

// Junta extrações de lotes de fotos (modelo aceita no máximo 3 imagens por chamada).
export function mergeInvoiceExtractions(parts: InvoiceExtraction[]): InvoiceExtraction {
  const first = parts.find((p) => p.supplier_name || p.supplier_cnpj) || parts[0] || { items: [] }
  return {
    supplier_name: first.supplier_name ?? null,
    supplier_cnpj: first.supplier_cnpj ?? null,
    items: parts.flatMap((p) => p.items),
  }
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}
