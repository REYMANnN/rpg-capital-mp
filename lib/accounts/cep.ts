import { normalizeDigits } from './validation'

export type AddressFromCep = {
  street: string
  neighborhood: string
  city: string
  state: string
}

type ViaCepLike = {
  erro?: boolean | string
  logradouro?: unknown
  bairro?: unknown
  localidade?: unknown
  uf?: unknown
}

export function normalizeCep(value: string): string {
  return normalizeDigits(value).slice(0, 8)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function mapViaCepResponse(input: unknown): AddressFromCep | null {
  if (!input || typeof input !== 'object') return null
  const data = input as ViaCepLike
  if (data.erro === true || data.erro === 'true') return null

  const city = text(data.localidade)
  const state = text(data.uf).toUpperCase()
  const street = text(data.logradouro)
  const neighborhood = text(data.bairro)

  if (!city || state.length !== 2) return null
  return { street, neighborhood, city, state }
}
