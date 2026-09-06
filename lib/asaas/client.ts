const ASAAS_PRODUCTION_API = 'https://api.asaas.com/v3'
const ASAAS_SANDBOX_API = 'https://api-sandbox.asaas.com/v3'

export type AsaasCreditCard = {
  holderName: string
  number: string
  expiryMonth: string
  expiryYear: string
  ccv: string
}

export type AsaasCreditCardHolderInfo = {
  name: string
  email: string
  cpfCnpj: string
  postalCode: string
  addressNumber: string
  addressComplement?: string | null
  phone?: string
  mobilePhone?: string
}

export type AsaasCustomerInput = {
  name: string
  cpfCnpj: string
  email?: string
  phone?: string
  mobilePhone?: string
  externalReference: string
}

export type AsaasSubscriptionInput = {
  customer: string
  value: number
  nextDueDate: string
  description: string
  externalReference: string
  creditCard: AsaasCreditCard
  creditCardHolderInfo: AsaasCreditCardHolderInfo
  remoteIp: string
  maxPayments?: number
}

function requiredApiKey() {
  const value = process.env.ASAAS_API_KEY?.trim() || process.env.ASAAS_API_KEY_balcao?.trim()
  if (!value) throw new Error('ASAAS_API_KEY is not configured')
  return value
}

function apiBase() {
  return requiredApiKey().startsWith('$aact_hmlg_') ? ASAAS_SANDBOX_API : ASAAS_PRODUCTION_API
}

async function parseResponse(response: Response) {
  const body = await response.json().catch(() => ({})) as Record<string, any>
  if (!response.ok) {
    const first = Array.isArray(body.errors) ? body.errors[0] : null
    const message = typeof first?.description === 'string'
      ? first.description
      : typeof body.message === 'string'
        ? body.message
        : `Asaas request failed (${response.status})`
    const error = new Error(message) as Error & { status?: number; code?: string }
    error.status = response.status
    error.code = typeof first?.code === 'string' ? first.code : undefined
    throw error
  }
  return body
}

async function asaasRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'User-Agent': 'BALCAO/0.2 (Next.js)',
      access_token: requiredApiKey(),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    cache: 'no-store',
    signal: init.signal ?? AbortSignal.timeout(65_000),
  })
  return parseResponse(response)
}

export async function findAsaasCustomerByExternalReference(externalReference: string) {
  const body = await asaasRequest(`/customers?externalReference=${encodeURIComponent(externalReference)}&limit=1`)
  const data = Array.isArray(body.data) ? body.data : []
  return data[0] ?? null
}

export async function createAsaasCustomer(input: AsaasCustomerInput) {
  return asaasRequest('/customers', {
    method: 'POST',
    body: JSON.stringify({ ...input, notificationDisabled: false }),
  })
}

export async function ensureAsaasCustomer(input: AsaasCustomerInput) {
  const existing = await findAsaasCustomerByExternalReference(input.externalReference)
  return existing ?? createAsaasCustomer(input)
}

export async function findAsaasSubscriptionByExternalReference(externalReference: string) {
  const body = await asaasRequest(`/subscriptions?externalReference=${encodeURIComponent(externalReference)}&limit=1`)
  const data = Array.isArray(body.data) ? body.data : []
  return data[0] ?? null
}

export async function createAsaasCreditCardSubscription(input: AsaasSubscriptionInput) {
  return asaasRequest('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      customer: input.customer,
      billingType: 'CREDIT_CARD',
      value: input.value,
      nextDueDate: input.nextDueDate,
      cycle: 'MONTHLY',
      description: input.description,
      externalReference: input.externalReference,
      ...(typeof input.maxPayments === 'number' ? { maxPayments: input.maxPayments } : {}),
      creditCard: input.creditCard,
      creditCardHolderInfo: input.creditCardHolderInfo,
      remoteIp: input.remoteIp,
    }),
  })
}

export async function ensureAsaasCreditCardSubscription(input: AsaasSubscriptionInput) {
  const existing = await findAsaasSubscriptionByExternalReference(input.externalReference)
  return existing ?? createAsaasCreditCardSubscription(input)
}
