import assert from 'node:assert/strict'
import test from 'node:test'
import { billingMessage, inviteMessage, normalizeInvitePhone, paidUntilDate } from '../lib/admin/invite-core.ts'
import { rafaWhatsAppLink } from '../lib/invite-onboarding.ts'

test('link da Rafa aceita loja acentuada e é decodificável', () => {
  const href = rafaWhatsAppLink('Mercadinho São João', '5511936201445')
  const url = new URL(href)
  assert.equal(url.hostname, 'wa.me')
  assert.equal(url.pathname, '/5511936201445')
  assert.equal(url.searchParams.get('text'), 'Olá, Rafa! Sou novo por aqui. Minha loja é Mercadinho São João.')
})

test('normalização do WhatsApp do convite', () => {
  assert.equal(normalizeInvitePhone('(12) 99767-2260'), '5512997672260')
})

test('mensagens de convite e cobrança têm os campos certos', () => {
  const invite = inviteMessage('Teste', 'https://www.rpgcapital.com.br/convite/RPG-ABC123')
  assert.match(invite, /Teste/)
  assert.match(invite, /RPG-ABC123/)
  const charge = billingMessage('Teste', 999, 'minha-chave-pix')
  assert.match(charge, /R\$\s*9,99/)
  assert.match(charge, /minha-chave-pix/)
})

test('paid_until é data do pagamento mais 30 dias', () => {
  assert.equal(paidUntilDate('2026-10-01T09:30:00.000Z'), '2026-10-31')
})
