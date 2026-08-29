import { z } from 'zod'
import { BUSINESS_TYPES } from './validation'

const uuid = z.string().uuid('Identificador inválido.')
const role = z.enum(['stock', 'cashier', 'manager', 'custom'])

const staffCreateSchema = z.object({
  storeId: uuid,
  displayName: z.string().trim().min(2, 'Informe o nome do funcionário.').max(80),
  role,
  pin: z.string().regex(/^\d{4}$/, 'O PIN deve ter 4 números.'),
  customPermissions: z.array(z.string()).max(30).optional().default([]),
})

const inviteCreateSchema = z.object({
  storeId: uuid,
  displayName: z.string().trim().min(2, 'Dê um nome para o dispositivo.').max(80),
})

const staffLoginSchema = z.object({
  staffId: uuid,
  pin: z.string().regex(/^\d{4}$/, 'Digite seu PIN de 4 números.'),
})

const storeCreateSchema = z.object({
  businessId: uuid,
  displayName: z.string().trim().min(2, 'Informe o nome da loja.').max(120),
  businessType: z.enum(BUSINESS_TYPES),
  cep: z.string().transform((value) => value.replace(/\D/g, '')).refine((value) => value.length === 8, 'Informe um CEP com 8 números.'),
  street: z.string().trim().min(2, 'Informe o endereço.'),
  number: z.string().trim().min(1, 'Informe o número.'),
  complement: z.string().trim().max(120).optional().default(''),
  neighborhood: z.string().trim().max(120).optional().default(''),
  city: z.string().trim().min(2, 'Informe a cidade.'),
  state: z.string().trim().toUpperCase().length(2, 'Informe a UF.'),
})

export const parseStaffCreate = (input: unknown) => staffCreateSchema.safeParse(input)
export const parseInviteCreate = (input: unknown) => inviteCreateSchema.safeParse(input)
export const parseStaffLogin = (input: unknown) => staffLoginSchema.safeParse(input)
export const parseStoreCreate = (input: unknown) => storeCreateSchema.safeParse(input)
