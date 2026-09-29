// Preço de venda dos produtos novos da nota, um de cada vez (regras puras, sem banco).

export type PriceAnswer =
  | { kind: 'price'; cents: number }
  | { kind: 'skip' }
  | { kind: 'stop' }
  | { kind: 'resume' }

const FILLER = new Set(['r', 'rs', 'reais', 'reias', 'reis', 'real', 'conto', 'contos', 'pila', 'pilas', 'centavos', 'centavo', 'vendo', 'vende', 'vender', 'por', 'a', 'o', 'e', 'eh', 'preco', 'sai', 'fica', 'custa', 'pode', 'ser', 'coloca', 'colocar', 'bota', 'eu', 'ta', 'tá', 'uns', 'uma', 'um', 'no', 'na', 'de'])

function normalize(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/r\$/g, ' r ').replace(/\s+/g, ' ').trim()
}

// "11,99" · "R$ 11,99" · "vendo a 11.99" · "11 e 99" · "11 reais e 99 centavos" · "12" · "pula" · "para"
export function parsePriceAnswer(raw: string): PriceAnswer | null {
  const text = normalize(raw).replace(/[.!?]+$/, '')
  if (!text || text.length > 60) return null
  if (/^(pula|pular|pulo|proximo|depois|nao sei|sei la)\b/.test(text)) return { kind: 'skip' }
  if (/^(para|parar|chega|cancela|cancelar|sair|deixa pra la)\b/.test(text)) return { kind: 'stop' }
  if (/^(continua|continuar|continuar os precos|continuar precos|voltar aos precos|precos pendentes)$/.test(text)) return { kind: 'resume' }

  const reaisCentavos = text.match(/^(?:\D*?)(\d{1,5})\s*(?:reais|real)?\s*e\s*(\d{1,2})\s*(?:centavos?)?\s*$/)
  let cents: number | null = null
  let rest = text
  if (reaisCentavos) {
    cents = Number(reaisCentavos[1]) * 100 + Number(reaisCentavos[2].padEnd(2, '0'))
    rest = text.replace(reaisCentavos[1], ' ').replace(new RegExp(`\\b${reaisCentavos[2]}\\b`), ' ')
  } else {
    const numbers = text.match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/g) || []
    if (numbers.length !== 1) return null
    const token = numbers[0]
    const value = token.includes(',')
      ? Number(token.replace(/\./g, '').replace(',', '.'))
      : /^\d{1,3}(\.\d{3})+$/.test(token) ? Number(token.replace(/\./g, '')) : Number(token)
    if (!Number.isFinite(value)) return null
    cents = Math.round(value * 100)
    rest = text.replace(token, ' ')
  }
  // O resto da mensagem só pode ter palavras de preço ("vendo a", "reais"...), senão é outra conversa.
  const words = rest.split(/[^a-z]+/).filter(Boolean)
  if (words.some((word) => word.length > 2 && !FILLER.has(word))) return null
  if (!cents || cents <= 0 || cents > 10_000_000) return null
  return { kind: 'price', cents }
}

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export type QuestionRow = { name: string; cost_cents: number; quantity_milli: number; unit?: string }

export function priceQuestion(row: QuestionRow, remaining: number, intro?: { total: number }) {
  const kg = row.unit === 'KG'
  const lines = [
    intro ? `Achei ${intro.total} produto(s) novo(s) nessa nota. Vamos colocar o preço de venda, um de cada vez.` : null,
    `${remaining > 1 ? `Faltam ${remaining}` : 'Último'} · ${row.name}`,
    `Custo: ${money(row.cost_cents)}${kg ? ' o kg' : ''} · chegaram ${(row.quantity_milli / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${kg ? 'kg' : 'un.'}`,
    `Por quanto você vende${kg ? ' o kg' : ''}? Responde só o preço (ex.: 11,99), ou "pula" pra deixar pra depois.`,
  ]
  return lines.filter(Boolean).join('\n')
}

export function belowCostWarning(row: QuestionRow, cents: number) {
  return `${row.name}: o custo é ${money(row.cost_cents)} e você disse ${money(cents)}, abaixo do custo. É isso mesmo? Manda o mesmo valor de novo pra confirmar, ou o preço certo.`
}

export function registeredMessage(row: QuestionRow, cents: number) {
  const kg = row.unit === 'KG'
  return `✅ ${row.name} cadastrado: ${money(cents)}${kg ? ' o kg' : ''}, ${(row.quantity_milli / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${kg ? 'kg' : 'un.'} no estoque.`
}


export type BatchPriceItem = { name: string }
export type BatchPriceResult = { prices: Array<{ index: number; cents: number }>; skipped: number[] }

function batchMoney(token: string): number | null {
  const clean = token.trim().replace(/^r\$?\s*/i, '').replace(/\./g, (match, offset, source) => source.includes(',') ? '' : match).replace(',', '.')
  const value = Number(clean)
  if (!Number.isFinite(value) || value <= 0 || value > 100000) return null
  return Math.round(value * 100)
}

function normalizeName(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function uniqueNameIndex(label: string, items: BatchPriceItem[]) {
  const words = normalizeName(label).split(' ').filter((word) => word.length >= 3)
  if (!words.length) return null
  const matches = items.map((item, index) => ({ index, name: normalizeName(item.name) }))
    .filter((item) => words.some((word) => item.name.split(' ').includes(word)))
  const unique = [...new Set(matches.map((match) => match.index))]
  return unique.length === 1 ? unique[0] : null
}

// Lista de preços da nota: ordem, número do item, nome + valor ou pular item.
export function parseBatchPrices(raw: string, items: BatchPriceItem[]): BatchPriceResult | null {
  const text = normalize(raw).replace(/[!?]+$/g, '').trim()
  if (!text || !items.length || text.length > 500) return null

  const skipped = new Set<number>()
  const prices = new Map<number, number>()

  for (const match of text.matchAll(/\bpula(?:r)?\s+(\d{1,2})\b/g)) {
    const index = Number(match[1]) - 1
    if (index >= 0 && index < items.length) skipped.add(index)
  }
  if (/^(depois|pula|pular)$/.test(text)) skipped.add(0)

  // 1=50 · 1: 50
  for (const match of text.matchAll(/\b(\d{1,2})\s*(?:=|:)\s*(?:r\$?\s*)?(\d+(?:[.,]\d{1,2})?)/g)) {
    const index = Number(match[1]) - 1
    const cents = batchMoney(match[2])
    if (index >= 0 && index < items.length && cents) prices.set(index, cents)
  }
  // item 2 12
  for (const match of text.matchAll(/\bitem\s+(\d{1,2})\s+(?:r\$?\s*)?(\d+(?:[.,]\d{1,2})?)/g)) {
    const index = Number(match[1]) - 1
    const cents = batchMoney(match[2])
    if (index >= 0 && index < items.length && cents) prices.set(index, cents)
  }

  // arroz 50 feijao 12: separa cada trecho de nome imediatamente antes do valor.
  if (!prices.size) {
    const tokens = [...text.matchAll(/(?:^|\s)([a-z][a-z0-9 ]*?)\s+(?:r\$?\s*)?(\d+(?:[.,]\d{1,2})?)(?=\s+[a-z]|$)/g)]
    for (const match of tokens) {
      const index = uniqueNameIndex(match[1], items)
      const cents = batchMoney(match[2])
      if (index !== null && cents) prices.set(index, cents)
    }
  }

  // Só números = valores na ordem: "50, 12, 23", "50 12 23", "50/12/23".
  if (!prices.size && !skipped.size && /^[\s\d,./]+$/.test(text)) {
    let pieces: string[]
    if (text.includes('/')) pieces = text.split('/')
    else if ((text.match(/,/g) || []).length >= 2 || /,\s+/.test(text)) pieces = text.split(',')
    else if (/\s+/.test(text.trim())) pieces = text.trim().split(/\s+/)
    else pieces = [text]
    const values = pieces.map((piece) => batchMoney(piece)).filter((value): value is number => value !== null)
    if (values.length && values.length === pieces.filter((piece) => piece.trim()).length) {
      values.slice(0, items.length).forEach((cents, index) => prices.set(index, cents))
    }
  }

  if (!prices.size && !skipped.size) return null
  return {
    prices: [...prices.entries()].sort((a, b) => a[0] - b[0]).map(([index, cents]) => ({ index, cents })),
    skipped: [...skipped].sort((a, b) => a - b),
  }
}

export function batchPriceRequestMessage(rows: QuestionRow[]) {
  const list = rows.map((row, index) => `${index + 1}. ${row.name} (${row.cost_cents > 0 ? `custo ${money(row.cost_cents)}${row.unit === 'KG' ? '/kg' : ''}` : 'custo não aparece na nota: me diz o custo também'})`)
  return [
    `Faltam os preços de venda de ${rows.length} produto${rows.length === 1 ? '' : 's'} da nota:`,
    ...list,
    'Me manda os preços do jeito que for mais fácil: "50, 12, 23" na ordem, ou "arroz 50 feijão 12".',
  ].join('\n')
}
