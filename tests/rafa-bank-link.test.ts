import test from 'node:test'
import assert from 'node:assert/strict'
import { bankMissingResult, bankStatusFrom, connectBankUrl } from '../lib/rafa-bank-link.ts'
import { isInAppBrowser } from '../lib/in-app-browser.ts'

test('status do banco a partir das conexões', () => {
  assert.equal(bankStatusFrom([]), 'nao_conectado')
  assert.equal(bankStatusFrom([{ status: 'disconnected' }]), 'nao_conectado')
  assert.equal(bankStatusFrom([{ status: 'error' }]), 'precisa_reconectar')
  assert.equal(bankStatusFrom([{ status: 'attention' }, { status: 'disconnected' }]), 'precisa_reconectar')
  assert.equal(bankStatusFrom([{ status: 'error' }, { status: 'active' }]), 'conectado')
  assert.equal(bankStatusFrom([{ status: 'pending' }]), 'conectado')
})

test('link de conectar banco aponta para /conectar-banco da loja', () => {
  const id = '3d9c1829-4871-46fe-8c9d-1780ca0a773c'
  assert.equal(connectBankUrl(id), `https://www.rpgcapital.com.br/conectar-banco?loja=${id}`)
  const r = bankMissingResult(id, 'nao_conectado')
  assert.equal(r.conectado, false)
  assert.equal(r.link_conectar_banco, connectBankUrl(id))
  assert.match(bankMissingResult(id, 'precisa_reconectar').situacao, /caiu/)
})

test('detecta navegador interno de app', () => {
  assert.equal(isInAppBrowser('Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'), true)
  assert.equal(isInAppBrowser('Mozilla/5.0 (Linux; Android 13; SM-A135M Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120 Mobile Safari/537.36'), true)
  assert.equal(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Instagram 300.0'), true)
  assert.equal(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'), false)
  assert.equal(isInAppBrowser('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36'), false)
})
