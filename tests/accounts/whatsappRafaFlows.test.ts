import assert from 'node:assert/strict'
import test from 'node:test'

import { createBalcaoDeepLink, redeemBalcaoDeepLink, verifyBalcaoDeepLink } from '../../lib/deeplink.ts'
import { routeShelfScan } from '../../lib/inventory/scanRouting.ts'
import { interactiveFlow, flowIntent } from '../../lib/whatsapp-interactive.ts'
import { formatWhatsAppFlowSummary } from '../../lib/whatsapp-flow.ts'

process.env.BALCAO_LINK_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef'

test('interactive button ids map to the three Rafa flows', () => {
  assert.equal(interactiveFlow({ type: 'interactive', interactive: { button_reply: { id: 'vender' } } }), 'vender')
  assert.equal(interactiveFlow({ type: 'interactive', interactive: { button_reply: { id: 'ler_codigo' } } }), 'ler-codigo')
  assert.equal(interactiveFlow({ type: 'interactive', interactive: { button_reply: { id: 'prateleira' } } }), 'prateleira')
  assert.equal(flowIntent('ler-codigo'), 'ler_codigo')
  assert.equal(interactiveFlow({ type: 'text', text: { body: 'vender' } }), null)
})

test('deep link expires after configured TTL', async () => {
  const { token } = await createBalcaoDeepLink({ waId: '5511999999999', fluxo: 'vender' }, -1)
  await assert.rejects(() => verifyBalcaoDeepLink(token, 'vender'), /expired|JWT/i)
})

test('deep link rejects tampering', async () => {
  const { token } = await createBalcaoDeepLink({ waId: '5511999999999', fluxo: 'vender' })
  const last = token.at(-1) === 'a' ? 'b' : 'a'
  const tampered = token.slice(0, -1) + last
  await assert.rejects(() => verifyBalcaoDeepLink(tampered, 'vender'))
})

test('deep link jti can only be redeemed once', async () => {
  const { token } = await createBalcaoDeepLink({ waId: '5511999999999', fluxo: 'prateleira' })
  const used = new Set<string>()
  const mark = async (claims: { jti: string }) => {
    if (used.has(claims.jti)) return false
    used.add(claims.jti)
    return true
  }
  await redeemBalcaoDeepLink(token, 'prateleira', mark)
  await assert.rejects(() => redeemBalcaoDeepLink(token, 'prateleira', mark), /link_reused/)
})

test('shelf scan distinguishes NF-e key/DANFE QR from EAN', () => {
  const nfe = '35260812345678000190550010009000011123456783'
  assert.deepEqual(routeShelfScan(nfe), { kind: 'nfe', key: nfe })
  assert.deepEqual(routeShelfScan(`https://nfe.fazenda.sp.gov.br/qrcode?p=${nfe}|2|1`), { kind: 'nfe', key: nfe })
  assert.deepEqual(routeShelfScan('7891000100103'), { kind: 'ean', code: '7891000100103' })
  assert.equal(routeShelfScan('qualquer coisa').kind, 'invalid')
})

test('Rafa summaries contain operational facts and signature', () => {
  const text = formatWhatsAppFlowSummary({
    kind: 'product',
    name: 'Produto teste',
    priceCents: 1000,
    costCents: 700,
    stock: '4 un.',
  })
  assert.match(text, /Margem:/)
  assert.match(text, /— Rafa$/)
  assert.doesNotMatch(text, /cr[eé]dito|empr[eé]stimo/i)
})
