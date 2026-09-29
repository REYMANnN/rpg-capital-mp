import assert from 'node:assert/strict'
import test from 'node:test'
import { billingMessage, inviteLink, inviteMessage, inviteWhatsAppUrl, normalizeInvitePhone, paidUntilDate } from '../lib/admin/invite-core.ts'

test('link do convite usa /convite', () => {
  assert.equal(inviteLink('RPG-ABC123'), 'https://www.rpgcapital.com.br/convite/RPG-ABC123')
})

test('mensagem do convite tem pessoa e link', () => {
  const link = inviteLink('RPG-ABC123')
  assert.equal(inviteMessage('Teste', link), `Oi, Teste! Criei um acesso pra você testar o Balcão da RPG, de graça. Leva 3 minutos: ${link}`)
})

test('normaliza telefone e monta wa.me', () => {
  assert.equal(normalizeInvitePhone('(12) 99767-2260'), '5512997672260')
  const url = inviteWhatsAppUrl('(12) 99767-2260', 'Olá!')
  assert.equal(url, 'https://wa.me/5512997672260?text=Ol%C3%A1!')
})

test('cobrança usa preço e Pix', () => {
  assert.match(billingMessage('Mercado Teste', 999, 'pix-chave'), /R\$\s*9,99\/mês/)
  assert.match(billingMessage('Mercado Teste', 999, 'pix-chave'), /Pix: pix-chave/)
})

test('pago até soma 30 dias', () => {
  assert.equal(paidUntilDate('2026-10-01T12:00:00.000Z'), '2026-10-31')
})
