import { z } from 'zod'

export const BUSINESS_TYPES = [
  'mercadinho',
  'supermercado',
  'conveniencia',
  'distribuidora',
  'farmacia',
  'emporio',
  'padaria',
  'acougue',
  'hortifruti',
  'bebidas',
  'petshop',
  'cosmeticos',
  'material_construcao',
  'papelaria',
  'outro',
] as const

export const REFERRAL_SOURCES = ['instagram', 'google', 'referral', 'ai', 'youtube_tiktok', 'other'] as const
export const PIX_KEY_TYPES = ['', 'cpf', 'cnpj', 'phone', 'email', 'evp'] as const
export type PixKeyType = (typeof PIX_KEY_TYPES)[number]

export function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function allSame(value: string): boolean {
  return /^(\d)\1+$/.test(value)
}

export function formatCep(value: string): string {
  const digits = normalizeDigits(value).slice(0, 8)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

export function formatPhone(value: string): string {
  const digits = normalizeNationalPhone(value).slice(0, 11)
  if (!digits) return ''
  if (digits.length <= 2) return `(${digits}`

  const area = digits.slice(0, 2)
  const local = digits.slice(2)
  const prefixLength = digits.length > 10 ? 5 : 4
  if (local.length <= prefixLength) return `(${area}) ${local}`
  return `(${area}) ${local.slice(0, prefixLength)}-${local.slice(prefixLength)}`
}

function formatCpf(value: string): string {
  const digits = normalizeDigits(value).slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function formatCnpj(value: string): string {
  const digits = normalizeDigits(value).slice(0, 14)
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export function formatTaxId(value: string): string {
  const digits = normalizeDigits(value)
  return digits.length <= 11 ? formatCpf(digits) : formatCnpj(digits)
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeDigits(value)
  if (cpf.length !== 11 || allSame(cpf)) return false
  const calc = (length: number) => {
    let sum = 0
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i)
    const remainder = (sum * 10) % 11
    return remainder === 10 ? 0 : remainder
  }
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10])
}

export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeDigits(value)
  if (cnpj.length !== 14 || allSame(cnpj)) return false
  const digit = (baseLength: 12 | 13) => {
    const weights = baseLength === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = weights.reduce((acc, weight, index) => acc + Number(cnpj[index]) * weight, 0)
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13])
}

function normalizeNationalPhone(value: string): string {
  const digits = normalizeDigits(value)
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits.slice(2)
  return digits
}

function isValidPhone(value: string): boolean {
  const digits = normalizeNationalPhone(value)
  return digits.length === 10 || digits.length === 11
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function isValidEvp(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

export function formatPixKey(type: PixKeyType, value: string): string {
  if (type === 'cpf') return formatCpf(value)
  if (type === 'cnpj') return formatCnpj(value)
  if (type === 'phone') return formatPhone(value)
  if (type === 'evp') return value.trim().slice(0, 36)
  if (type === 'email') return value.slice(0, 254)
  return value
}

export function normalizePixKey(type: PixKeyType, value: string): string {
  if (!value.trim()) return ''
  if (type === 'cpf') return normalizeDigits(value).slice(0, 11)
  if (type === 'cnpj') return normalizeDigits(value).slice(0, 14)
  if (type === 'phone') {
    const national = normalizeNationalPhone(value).slice(0, 11)
    return national ? `+55${national}` : ''
  }
  if (type === 'email') return value.trim().toLowerCase()
  if (type === 'evp') return value.trim().toLowerCase()
  return value.trim()
}

export function validatePixKeyForType(type: PixKeyType, value: string): boolean {
  if (!value.trim()) return true
  if (type === 'cpf') return isValidCpf(value)
  if (type === 'cnpj') return isValidCnpj(value)
  if (type === 'phone') return isValidPhone(value)
  if (type === 'email') return isValidEmail(value)
  if (type === 'evp') return isValidEvp(value)
  return false
}

export function validatePixKey(value: string): boolean {
  const key = value.trim()
  if (!key) return true
  const digits = normalizeDigits(key)
  if (digits.length === 11 && isValidCpf(digits)) return true
  if (digits.length === 14 && isValidCnpj(digits)) return true
  if (/^\+55\d{10,11}$/.test(key)) return true
  if (isValidEmail(key)) return true
  if (isValidEvp(key)) return true
  return false
}

const onboardingSchema = z.object({
  businessName: z.string().trim().min(2, 'Informe o nome do seu negócio.').max(120),
  businessType: z.enum(BUSINESS_TYPES),
  cep: z.string().transform(normalizeDigits).refine((value) => value.length === 8, 'Informe um CEP com 8 números.'),
  street: z.string().trim().min(2, 'Informe o endereço.'),
  number: z.string().trim().min(1, 'Informe o número.'),
  complement: z.string().trim().max(120).optional().default(''),
  neighborhood: z.string().trim().max(120).optional().default(''),
  city: z.string().trim().min(2, 'Informe a cidade.'),
  state: z.string().trim().toUpperCase().length(2, 'Informe a UF com 2 letras.'),
  phone: z.string().transform(normalizeDigits).refine((value) => value.length >= 10 && value.length <= 11, 'Informe um telefone válido.'),
  taxId: z.string().trim().refine((value) => isValidCpf(value) || isValidCnpj(value), 'Informe um CPF ou CNPJ válido.'),
  pixType: z.enum(PIX_KEY_TYPES).optional().default(''),
  pixKey: z.string().trim().optional().default(''),
  referralSource: z.enum(REFERRAL_SOURCES),
  referralOther: z.string().trim().max(240).optional().default(''),
}).superRefine((data, ctx) => {
  if (data.pixKey) {
    const valid = data.pixType ? validatePixKeyForType(data.pixType, data.pixKey) : validatePixKey(data.pixKey)
    if (!valid) ctx.addIssue({ code: 'custom', path: ['pixKey'], message: 'Confira a chave Pix e o tipo selecionado.' })
  }
  if (data.referralSource === 'other' && !data.referralOther) {
    ctx.addIssue({ code: 'custom', path: ['referralOther'], message: 'Conte como você conheceu o BALCÃO.' })
  }
})

export type OnboardingInput = z.input<typeof onboardingSchema>
export type OnboardingData = z.output<typeof onboardingSchema>

export function validateOnboarding(input: unknown) {
  return onboardingSchema.safeParse(input)
}
