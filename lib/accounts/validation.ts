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

export function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function allSame(value: string): boolean {
  return /^(\d)\1+$/.test(value)
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

export function validatePixKey(value: string): boolean {
  const key = value.trim()
  if (!key) return true
  const digits = normalizeDigits(key)
  if (digits.length === 11 && isValidCpf(digits)) return true
  if (digits.length === 14 && isValidCnpj(digits)) return true
  if (/^\+55\d{10,11}$/.test(key)) return true
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return true
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) return true
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
  pixKey: z.string().trim().optional().default('').refine(validatePixKey, 'Confira a chave Pix.'),
  referralSource: z.enum(REFERRAL_SOURCES),
  referralOther: z.string().trim().max(240).optional().default(''),
}).superRefine((data, ctx) => {
  if (data.referralSource === 'other' && !data.referralOther) {
    ctx.addIssue({ code: 'custom', path: ['referralOther'], message: 'Conte como você conheceu o BALCÃO.' })
  }
})

export type OnboardingInput = z.input<typeof onboardingSchema>
export type OnboardingData = z.output<typeof onboardingSchema>

export function validateOnboarding(input: unknown) {
  return onboardingSchema.safeParse(input)
}

export function formatTaxId(value: string): string {
  const digits = normalizeDigits(value)
  if (digits.length <= 11) {
    return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return digits.slice(0, 14).replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}
