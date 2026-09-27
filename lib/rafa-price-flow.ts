// Preço de venda dos produtos novos da nota, um de cada vez (regras puras, sem banco).

export type PriceAnswer =
  | { kind: 'price'; cents: number }
  | { kind: 'skip' }
  | { kind: 'stop' }
  | { kind: 'resume' }

const FILLER = new Set(['r', 'reais', 'real', 'centavos', 'centavo', 'vendo', 'vende', 'vender', 'por', 'a', 'o', 'e', 'eh', 'preco', 'sai', 'fica', 'custa', 'pode', 'ser', 'coloca', 'colocar', 'bota', 'eu', 'ta', 'tá', 'uns', 'uma', 'um', 'no', 'na', 'de'])

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
  if (words.some((word) => !FILLER.has(word))) return null
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
