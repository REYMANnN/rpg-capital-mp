type Json = Record<string, unknown>

export class AsaasError extends Error {
  status: number
  code: string | null
  constructor(message: string, status: number, code: string | null = null) {
    super(message)
    this.name = 'AsaasError'
    this.status = status
    this.code = code
  }
}

function config() {
  const apiKey = process.env.ASAAS_API_KEY?.trim()
  if (!apiKey) throw new Error('ASAAS_API_KEY is not configured')
  const environment = process.env.ASAAS_ENV?.trim().toLowerCase() === 'production' ? 'production' : 'sandbox'
  return {
    apiKey,
    baseUrl: environment === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3',
  }
}

function errorMessage(payload: any, fallback: string) {
  const description = Array.isArray(payload?.errors) && typeof payload.errors[0]?.description === 'string'
    ? payload.errors[0].description
    : typeof payload?.message === 'string' ? payload.message : ''
  return description.trim() || fallback
}

async function asaasRequest<T>(path: string, init: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: Json; query?: Record<string, string | number | boolean | null | undefined> } = {}): Promise<T> {
  const { apiKey, baseUrl } = config()
  const url = new URL(`${baseUrl}${path}`)
  Object.entries(init.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  })

  const response = await fetch(url, {
    method: init.method || 'GET',
    headers: {
      accept: 'application/json',
      access_token: apiKey,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(65_000),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const code = Array.isArray(payload?.errors) && typeof payload.errors[0]?.code === 'string' ? payload.errors[0].code : null
    throw new AsaasError(errorMessage(payload, 'O Asaas não conseguiu processar esta operação.'), response.status, code)
  }
  return payload as T
}

export type AsaasCustomer = { id: string; name?: string; externalReference?: string }
export type AsaasPayment = { id: string; status?: string; subscription?: string | null; dueDate?: string; value?: number; externalReference?: string }
export type AsaasSubscription = { id: string; status?: string; value?: number; nextDueDate?: string; externalReference?: string }
export type AsaasCreditCardToken = { creditCardToken: string; creditCardBrand?: string; creditCardNumber?: string }

export async function findAsaasCustomerByExternalReference(externalReference: string) {
  const response = await asaasRequest<{ data?: AsaasCustomer[] }>('/customers', { query: { externalReference, limit: 1 } })
  return response.data?.[0] ?? null
}

export async function findAsaasPaymentByExternalReference(externalReference: string) {
  const response = await asaasRequest<{ data?: AsaasPayment[] }>('/payments', { query: { externalReference, limit: 1 } })
  return response.data?.[0] ?? null
}

export async function findAsaasSubscriptionByExternalReference(externalReference: string) {
  const response = await asaasRequest<{ data?: AsaasSubscription[] }>('/subscriptions', { query: { externalReference, limit: 1 } })
  return response.data?.[0] ?? null
}

export async function createAsaasCustomer(input: { name: string; cpfCnpj: string; email?: string | null; mobilePhone?: string | null; externalReference: string }) {
  return asaasRequest<AsaasCustomer>('/customers', {
    method: 'POST',
    body: {
      name: input.name,
      cpfCnpj: input.cpfCnpj,
      email: input.email || undefined,
      mobilePhone: input.mobilePhone || undefined,
      externalReference: input.externalReference,
      notificationDisabled: false,
    },
  })
}

export async function ensureAsaasCustomer(input: { name: string; cpfCnpj: string; email?: string | null; mobilePhone?: string | null; externalReference: string }) {
  const existing = await findAsaasCustomerByExternalReference(input.externalReference)
  return existing ?? createAsaasCustomer(input)
}

export async function tokenizeCreditCard(input: {
  customer: string
  creditCard: { holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string }
  holder: { name: string; email: string; cpfCnpj: string; postalCode: string; addressNumber: string; addressComplement?: string | null; phone?: string | null; mobilePhone?: string | null }
  remoteIp: string
}) {
  return asaasRequest<AsaasCreditCardToken>('/creditCard/tokenizeCreditCard', {
    method: 'POST',
    body: {
      customer: input.customer,
      creditCard: input.creditCard,
      creditCardHolderInfo: input.holder,
      remoteIp: input.remoteIp,
    },
  })
}

export async function createCreditCardPayment(input: {
  customer: string
  creditCardToken: string
  valueCents: number
  dueDate: string
  remoteIp: string
  externalReference: string
  description: string
}) {
  const existing = await findAsaasPaymentByExternalReference(input.externalReference)
  if (existing) return existing
  return asaasRequest<AsaasPayment>('/payments', {
    method: 'POST',
    body: {
      customer: input.customer,
      billingType: 'CREDIT_CARD',
      value: input.valueCents / 100,
      dueDate: input.dueDate,
      creditCardToken: input.creditCardToken,
      remoteIp: input.remoteIp,
      externalReference: input.externalReference,
      description: input.description,
    },
  })
}

export async function createCreditCardSubscription(input: {
  customer: string
  creditCardToken: string
  valueCents: number
  nextDueDate: string
  remoteIp: string
  externalReference: string
  description: string
}) {
  const existing = await findAsaasSubscriptionByExternalReference(input.externalReference)
  if (existing) return existing
  return asaasRequest<AsaasSubscription>('/subscriptions', {
    method: 'POST',
    body: {
      customer: input.customer,
      billingType: 'CREDIT_CARD',
      value: input.valueCents / 100,
      nextDueDate: input.nextDueDate,
      cycle: 'MONTHLY',
      creditCardToken: input.creditCardToken,
      remoteIp: input.remoteIp,
      externalReference: input.externalReference,
      description: input.description,
    },
  })
}

export async function updateSubscriptionValue(subscriptionId: string, valueCents: number) {
  return asaasRequest<AsaasSubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'PUT',
    body: {
      value: valueCents / 100,
      updatePendingPayments: false,
    },
  })
}

export async function updateSubscriptionCard(input: { subscriptionId: string; creditCardToken: string; remoteIp: string }) {
  return asaasRequest<AsaasSubscription>(`/subscriptions/${encodeURIComponent(input.subscriptionId)}/creditCard`, {
    method: 'PUT',
    body: { creditCardToken: input.creditCardToken, remoteIp: input.remoteIp },
  })
}
