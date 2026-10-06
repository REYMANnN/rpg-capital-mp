export type PixKeyType = 'cpf' | 'cnpj' | 'phone' | 'email' | 'evp'

export type PixParseResult =
  | { status: 'valid'; type: PixKeyType; key: string }
  | { status: 'none' | 'invalid' | 'ambiguous' }

const digits = (value: string) => String(value || '').replace(/\D/g, '')

function repeated(value: string) {
  return /^([0-9])\1+$/.test(value)
}

export function isValidCpf(value: string) {
  const cpf = digits(value)
  if (cpf.length !== 11 || repeated(cpf)) return false
  const calc = (length: number) => {
    let sum = 0
    for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i)
    const mod = (sum * 10) % 11
    return mod === 10 ? 0 : mod
  }
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10])
}

export function isValidCnpj(value: string) {
  const cnpj = digits(value)
  if (cnpj.length !== 14 || repeated(cnpj)) return false
  const check = (baseLength: 12 | 13) => {
    const weights = baseLength === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = weights.reduce((acc, weight, index) => acc + Number(cnpj[index]) * weight, 0)
    const mod = sum % 11
    return mod < 2 ? 0 : 11 - mod
  }
  return check(12) === Number(cnpj[12]) && check(13) === Number(cnpj[13])
}

export function normalizePixPhone(value: string) {
  let phone = digits(value)
  if (phone.startsWith('55') && (phone.length === 12 || phone.length === 13)) {
    // already Brazilian E.164 digits
  } else if (phone.length === 10 || phone.length === 11) {
    phone = `55${phone}`
  } else {
    return null
  }
  const local = phone.slice(2)
  if (!/^[1-9]{2}[2-9][0-9]{7,8}$/.test(local)) return null
  return `+${phone}`
}

function explicitPixIntent(text: string) {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return /\bchave\s+pix\b/.test(normalized)
    || /\bpix\s*(?:e|eh|:)/.test(normalized)
    || /\b(minha|essa|a)\s+chave\b/.test(normalized)
    || /\bchave\s+(?:e|eh|:)/.test(normalized)
}

function unique<T>(values: T[]) {
  return [...new Set(values)]
}

export function parseExplicitPixKey(text: string): PixParseResult {
  const raw = String(text || '').trim()
  if (!explicitPixIntent(raw)) return { status: 'none' }

  const candidates: Array<{ type: PixKeyType; key: string }> = []

  const emails = unique(raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}/gi) || [])
  for (const email of emails) {
    if (email.length <= 77) candidates.push({ type: 'email', key: email.toLowerCase() })
  }

  const evps = unique(raw.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi) || [])
  for (const evp of evps) candidates.push({ type: 'evp', key: evp.toLowerCase() })

  const numberChunks = unique(raw.match(/(?:\+?55[\s().-]*)?(?:\(?\d{2}\)?[\s.-]*)?\d[\d\s()./-]{7,20}\d/g) || [])
  for (const chunk of numberChunks) {
    const number = digits(chunk)
    if (number.length === 11 && isValidCpf(number)) {
      candidates.push({ type: 'cpf', key: number })
      continue
    }
    if (number.length === 14 && isValidCnpj(number)) {
      candidates.push({ type: 'cnpj', key: number })
      continue
    }
    const phone = normalizePixPhone(chunk)
    if (phone) candidates.push({ type: 'phone', key: phone })
  }

  const deduped = candidates.filter((candidate, index, all) =>
    all.findIndex((other) => other.type === candidate.type && other.key === candidate.key) === index)

  if (deduped.length === 1) return { status: 'valid', ...deduped[0] }
  if (deduped.length > 1) return { status: 'ambiguous' }
  return { status: 'invalid' }
}

export function pixReminder() {
  return 'Ah, ainda estou sem sua chave Pix. Ela serve para receber pagamentos. Não preciso da sua senha, código do banco ou outro dado bancário. Se quiser, pode me mandar a chave aqui.'
}
