import type { InvoiceExtraction, InvoiceItem } from '@/lib/rafa-ai-parse'

export function isValidGtin(value: string) {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false
  const digits = [...value].map(Number)
  const checkDigit = digits.pop()!
  let sum = 0
  for (let i = digits.length - 1, positionFromRight = 0; i >= 0; i--, positionFromRight++) {
    sum += digits[i] * (positionFromRight % 2 === 0 ? 3 : 1)
  }
  return (10 - (sum % 10)) % 10 === checkDigit
}

export function isValidCnpj(value: string) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false
  const calc = (base: string, weights: number[]) => {
    const sum = [...base].reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0)
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }
  const first = calc(digits.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2])
  if (first !== Number(digits[12])) return false
  const second = calc(digits.slice(0, 13), [6,5,4,3,2,9,8,7,6,5,4,3,2])
  return second === Number(digits[13])
}

export type LineCheck = { ok: boolean; reasons: string[] }

export function checkLine(item: InvoiceItem): LineCheck {
  const reasons: string[] = []
  const q = Number(item.quantity)
  const vu = Number(item.unit_cost_cents)
  const vt = Number(item.total_cents)
  if (!(q > 0) || !(vu > 0) || !(vt >= 0)) {
    reasons.push('valor_incompleto')
  } else {
    const expected = q * vu
    // Os vetores de aceitação da Rafa exigem divergência máxima de 2 centavos por linha.
    // A margem percentual fica para a soma da nota, não para mascarar erro unitário.
    const tolerance = 2
    if (Math.abs(expected - vt) > tolerance) reasons.push('valor_nao_confere')
  }
  const ean = String(item.ean || '').replace(/\D/g, '')
  if (ean && !isValidGtin(ean)) reasons.push('ean_invalido')
  const letters = String(item.description || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z]/g, '')
  if (letters.length < 3) reasons.push('descricao_curta')
  return { ok: reasons.length === 0, reasons }
}

export function checkInvoice(extraction: InvoiceExtraction) {
  const lineResults = extraction.items.map(checkLine)
  const sumCents = extraction.items.reduce((sum, item) => sum + Math.round(Number(item.total_cents || 0)), 0)
  const printedTotalCents = extraction.printed_total_cents == null ? null : Number(extraction.printed_total_cents)
  const sumDiffPct = printedTotalCents && printedTotalCents > 0
    ? Math.abs(sumCents - printedTotalCents) / printedTotalCents * 100
    : 0
  const countMismatch = extraction.printed_item_count == null ? false : Number(extraction.printed_item_count) !== extraction.items.length
  const cnpj = String(extraction.supplier_cnpj || '').replace(/\D/g, '')
  const cnpjValid = cnpj ? isValidCnpj(cnpj) : null
  const okLines = lineResults.filter((result) => result.ok).length
  const score = okLines - (sumDiffPct > 1 ? 5 : 0) - (cnpjValid === false ? 3 : 0)
  return { lineResults, sumCents, printedTotalCents, sumDiffPct, countMismatch, cnpjValid, score }
}
