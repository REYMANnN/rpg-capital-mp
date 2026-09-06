export type BillingFieldErrors = Partial<Record<
  | 'cardHolderName'
  | 'cardNumber'
  | 'expiryMonth'
  | 'expiryYear'
  | 'ccv'
  | 'holderName'
  | 'holderEmail'
  | 'holderTaxId'
  | 'postalCode'
  | 'addressNumber'
  | 'mobilePhone',
  string
>>

export type BillingCreditCardInput = {
  holderName?: unknown
  number?: unknown
  expiryMonth?: unknown
  expiryYear?: unknown
  ccv?: unknown
}

export type BillingHolderInput = {
  name?: unknown
  email?: unknown
  cpfCnpj?: unknown
  postalCode?: unknown
  addressNumber?: unknown
  addressComplement?: unknown
  phone?: unknown
  mobilePhone?: unknown
}

export type NormalizedCreditCard = {
  holderName: string
  number: string
  expiryMonth: string
  expiryYear: string
  ccv: string
}

export type NormalizedHolder = {
  name: string
  email: string
  cpfCnpj: string
  postalCode: string
  addressNumber: string
  addressComplement?: string
  phone?: string
  mobilePhone?: string
}

export function digits(value: string) {
  return value.replace(/\D/g, '')
}

export function formatCardNumber(value: string) {
  return digits(value).slice(0, 19).replace(/(.{4})/g, '$1 ').trim()
}

export function formatCpfCnpj(value: string) {
  const clean = digits(value).slice(0, 14)
  if (clean.length <= 11) {
    return clean
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
  }
  return clean
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export function formatPostalCode(value: string) {
  const clean = digits(value).slice(0, 8)
  return clean.replace(/^(\d{5})(\d)/, '$1-$2')
}

export function formatPhone(value: string) {
  const clean = digits(value).slice(0, 11)
  if (clean.length <= 10) {
    return clean
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  }
  return clean
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

export function normalizeExpiryYear(value: string) {
  const clean = digits(value).slice(0, 4)
  if (clean.length === 2) return `20${clean}`
  return clean
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function validateAndNormalizeBillingInput(
  cardInput: BillingCreditCardInput | null | undefined,
  holderInput: BillingHolderInput | null | undefined,
) {
  const errors: BillingFieldErrors = {}

  const holderName = text(cardInput?.holderName)
  const number = digits(text(cardInput?.number))
  const monthDigits = digits(text(cardInput?.expiryMonth)).slice(0, 2)
  const expiryMonth = monthDigits ? monthDigits.padStart(2, '0') : ''
  const rawExpiryYear = digits(text(cardInput?.expiryYear)).slice(0, 4)
  const expiryYear = normalizeExpiryYear(rawExpiryYear)
  const ccv = digits(text(cardInput?.ccv)).slice(0, 4)

  if (holderName.length < 3) errors.cardHolderName = 'Nome impresso no cartão deve ter pelo menos 3 caracteres.'
  if (number.length < 13 || number.length > 19) errors.cardNumber = 'Número do cartão deve ter entre 13 e 19 dígitos.'
  const month = Number(expiryMonth)
  if (!expiryMonth || month < 1 || month > 12) errors.expiryMonth = 'Mês do vencimento inválido. Use um valor de 01 a 12.'
  if (![2, 4].includes(rawExpiryYear.length)) errors.expiryYear = 'Ano do vencimento inválido. Use 2 ou 4 dígitos, por exemplo 30 ou 2030.'
  if (ccv.length < 3 || ccv.length > 4) errors.ccv = 'CVV deve ter 3 ou 4 dígitos.'

  const name = text(holderInput?.name)
  const email = text(holderInput?.email).toLowerCase()
  const cpfCnpj = digits(text(holderInput?.cpfCnpj))
  const postalCode = digits(text(holderInput?.postalCode))
  const addressNumber = text(holderInput?.addressNumber)
  const addressComplement = text(holderInput?.addressComplement)
  const phone = digits(text(holderInput?.phone))
  const mobilePhone = digits(text(holderInput?.mobilePhone))

  if (name.length < 3) errors.holderName = 'Nome completo do titular deve ter pelo menos 3 caracteres.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.holderEmail = 'E-mail do titular inválido.'
  if (![11, 14].includes(cpfCnpj.length)) errors.holderTaxId = 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos.'
  if (postalCode.length !== 8) errors.postalCode = 'CEP deve ter 8 dígitos.'
  if (!addressNumber) errors.addressNumber = 'Informe o número do endereço.'
  if (mobilePhone && ![10, 11].includes(mobilePhone.length)) errors.mobilePhone = 'Celular deve ter 10 ou 11 dígitos com DDD.'

  const cardHasErrors = ['cardHolderName', 'cardNumber', 'expiryMonth', 'expiryYear', 'ccv'].some((key) => key in errors)
  const holderHasErrors = ['holderName', 'holderEmail', 'holderTaxId', 'postalCode', 'addressNumber', 'mobilePhone'].some((key) => key in errors)

  const creditCard: NormalizedCreditCard | null = cardHasErrors ? null : {
    holderName,
    number,
    expiryMonth,
    expiryYear,
    ccv,
  }

  const creditCardHolderInfo: NormalizedHolder | null = holderHasErrors ? null : {
    name,
    email,
    cpfCnpj,
    postalCode,
    addressNumber,
    ...(addressComplement ? { addressComplement } : {}),
    ...(phone ? { phone } : {}),
    ...(mobilePhone ? { mobilePhone } : {}),
  }

  return { creditCard, creditCardHolderInfo, errors }
}
