export type ParsedNfeItem = {
  line: number
  supplierCode: string
  barcode: string
  description: string
  quantityMilli: number
  unitCostCents: number
  totalCents: number
}

export type ParsedNfe = {
  accessKey: string
  number: string
  issuedAt: string
  supplierName: string
  supplierDocument: string
  items: ParsedNfeItem[]
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}

function tag(source: string, name: string) {
  const match = source.match(new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`, 'i'))
  return match ? decodeXml(match[1]) : ''
}

function validGtin(code: string) {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()!
  let sum = 0
  let weight = 3
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += digits[index] * weight
    weight = weight === 3 ? 1 : 3
  }
  return ((10 - (sum % 10)) % 10) === check
}

export function normalizeInvoiceBarcode(value: string | null | undefined) {
  const raw = String(value ?? '').replace(/\s+/g, '').trim()
  if (!raw || /^SEMGTIN$/i.test(raw)) return ''
  return validGtin(raw) ? raw : ''
}

function decimalToInt(value: string, multiplier: number) {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? Math.round(parsed * multiplier) : 0
}

export function parseNfeXml(xml: string): ParsedNfe {
  const source = String(xml || '').trim()
  if (!source || !/<(?:[\w.-]+:)?(?:nfeProc|NFe|infNFe)\b/i.test(source)) {
    throw new Error('XML de NF-e inválido.')
  }
  if ((source.match(/</g)?.length ?? 0) !== (source.match(/>/g)?.length ?? 0)) {
    throw new Error('XML de NF-e malformado.')
  }

  const infNfeOpen = source.match(/<(?:[\w.-]+:)?infNFe\b([^>]*)>/i)?.[1] ?? ''
  const id = infNfeOpen.match(/\bId\s*=\s*["']NFe([^"']+)["']/i)?.[1] ?? ''
  const emit = source.match(/<(?:[\w.-]+:)?emit(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?emit>/i)?.[1] ?? ''
  const detMatches = [...source.matchAll(/<(?:[\w.-]+:)?det\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?det>/gi)]
  if (!detMatches.length) throw new Error('NF-e sem itens de produto.')

  const items = detMatches.map((match, index) => {
    const attrs = match[1] ?? ''
    const body = match[2] ?? ''
    const prod = body.match(/<(?:[\w.-]+:)?prod(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?prod>/i)?.[1] ?? body
    const lineMatch = attrs.match(/\bnItem\s*=\s*["'](\d+)["']/i)
    const primaryBarcode = normalizeInvoiceBarcode(tag(prod, 'cEAN'))
    const tributaryBarcode = normalizeInvoiceBarcode(tag(prod, 'cEANTrib'))

    return {
      line: lineMatch ? Number(lineMatch[1]) : index + 1,
      supplierCode: tag(prod, 'cProd'),
      barcode: primaryBarcode || tributaryBarcode,
      description: tag(prod, 'xProd'),
      quantityMilli: decimalToInt(tag(prod, 'qCom'), 1000),
      unitCostCents: decimalToInt(tag(prod, 'vUnCom'), 100),
      totalCents: decimalToInt(tag(prod, 'vProd'), 100),
    }
  })

  if (items.some(item => !item.description || item.quantityMilli <= 0)) {
    throw new Error('NF-e contém item de produto inválido.')
  }

  return {
    accessKey: id,
    number: tag(source, 'nNF'),
    issuedAt: tag(source, 'dhEmi') || tag(source, 'dEmi'),
    supplierName: tag(emit, 'xNome'),
    supplierDocument: tag(emit, 'CNPJ') || tag(emit, 'CPF'),
    items,
  }
}
