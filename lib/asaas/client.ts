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
export type AsaasCheckout = { id: string; link?: string | null; status?: string; customer?: string | null }
export type AsaasSubscription = { id: string; customer?: string; status?: string; value?: number; nextDueDate?: string; externalReference?: string }

export async function findAsaasCustomerByExternalReference(externalReference: string) {
  const response = await asaasRequest<{ data?: AsaasCustomer[] }>('/customers', { query: { externalReference, limit: 1 } })
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

function checkoutUrl(checkout: AsaasCheckout) {
  if (checkout.link) return checkout.link
  return `https://asaas.com/checkoutSession/show?id=${encodeURIComponent(checkout.id)}`
}

export async function createRecurringCheckout(input: {
  customer: string
  valueCents: number
  nextDueDate: string
  externalReference: string
  successUrl: string
  cancelUrl: string
  expiredUrl: string
  itemName?: string
  itemDescription?: string
}) {
  const checkout = await asaasRequest<AsaasCheckout>('/checkouts', {
    method: 'POST',
    body: {
      billingTypes: ['CREDIT_CARD'],
      chargeTypes: ['RECURRENT'],
      minutesToExpire: 60,
      externalReference: input.externalReference,
      customer: input.customer,
      callback: {
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        expiredUrl: input.expiredUrl,
      },
      items: [{
        name: input.itemName || 'BALCÃO - conta bancária',
        description: input.itemDescription || 'Assinatura mensal do BALCÃO por conta bancária conectada',
        quantity: 1,
        value: input.valueCents / 100,
      }],
      subscription: {
        cycle: 'MONTHLY',
        nextDueDate: `${input.nextDueDate} 12:00:00`,
      },
    },
  })
  return { ...checkout, url: checkoutUrl(checkout) }
}

export async function deleteSubscription(subscriptionId: string) {
  return asaasRequest<Record<string, unknown>>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'DELETE' })
}
