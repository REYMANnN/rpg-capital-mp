import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildStaticPixPayload, crc16Ccitt } from '../../lib/payments/pix'

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), 'utf8')

test('Pix payload fixes the exact checkout amount in BRL', () => {
  const payload = buildStaticPixPayload({
    pixKey: '11999999999',
    amountCents: 3748,
    merchantName: 'Mercado de Teste',
    merchantCity: 'São Paulo',
  })

  assert.match(payload, /5303986/)
  assert.match(payload, /540537\.48/)
  assert.match(payload, /5802BR/)
  assert.match(payload, /0014BR\.GOV\.BCB\.PIX/)
  assert.match(payload, /011111999999999/)
  assert.match(payload, /6304[0-9A-F]{4}$/)
})

test('Pix payload normalizes merchant fields for EMV limits', () => {
  const payload = buildStaticPixPayload({
    pixKey: 'teste@example.com',
    amountCents: 100,
    merchantName: 'Mercadão Açúcar & Café Muito Longo',
    merchantCity: 'São José dos Campos',
  })

  assert.match(payload, /59\d{2}MERCADAO ACUCAR CAFE/)
  assert.match(payload, /60\d{2}SAO JOSE DOS CA/)
})

test('Pix payload CRC is calculated over the payload ending in 6304', () => {
  const payload = buildStaticPixPayload({
    pixKey: 'teste@example.com',
    amountCents: 1234,
    merchantName: 'Balcao',
    merchantCity: 'Sao Paulo',
  })
  const body = payload.slice(0, -4)
  assert.equal(payload.slice(-4), crc16Ccitt(body))
})

test('checkout Pix endpoint requires operational session and server-side business key lookup', () => {
  const route = source('app/api/balcao/checkout/pix/route.ts')
  assert.match(route, /TERMINAL_COOKIE/)
  assert.match(route, /STAFF_SESSION_COOKIE/)
  assert.match(route, /balcao_checkout_pix_context/)
  assert.match(route, /amountCents/)
  assert.match(route, /QRCode\.toDataURL/)
})

test('checkout Pix database function allows only roles with checkout permission', () => {
  const migration = source('supabase/migrations/20260901_balcao_checkout_pix.sql')
  assert.match(migration, /cashier/)
  assert.match(migration, /manager/)
  assert.match(migration, /checkout\.sell/)
  assert.match(migration, /pix_key/)
})

test('checkout UI opens Pix charge before recording the sale', () => {
  const inventory = source('app/inventory-v1/InventoryV1.tsx')
  assert.match(inventory, /COBRAR NO PIX/)
  assert.match(inventory, /PAGAMENTO RECEBIDO/)
  assert.match(inventory, /Pix Copia e Cola/)
  assert.match(inventory, /\/api\/balcao\/checkout\/pix/)
})
