import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  RAFA_FIELD_CONFIDENCE_THRESHOLD,
  RAFA_PRODUCT_RESOLUTION_ORDER,
  rafaAudioDurationDisposition,
  rafaConfirmationGate,
  rafaFieldNeedsReview,
} from '../../lib/rafa-phase2-core.ts'

test('confirmation accepts only confirm_yes button', () => {
  const expiresAt = new Date(Date.now() + 60_000).toISOString()
  assert.equal(rafaConfirmationGate({ buttonId: 'confirm_yes', expiresAt }), 'confirm')
  assert.equal(rafaConfirmationGate({ buttonId: 'confirm_no', expiresAt }), 'reject')
  assert.equal(rafaConfirmationGate({ text: 'sim', expiresAt }), 'requires_button')
  assert.equal(rafaConfirmationGate({ text: 'ss', expiresAt }), 'requires_button')
  assert.equal(rafaConfirmationGate({ text: 'isso', expiresAt }), 'requires_button')
  assert.equal(rafaConfirmationGate({ text: 'pode', expiresAt }), 'requires_button')
})

test('expired confirmation never writes', () => {
  assert.equal(rafaConfirmationGate({
    buttonId: 'confirm_yes',
    expiresAt: new Date(Date.now() - 1).toISOString(),
  }), 'expired')
})

test('changed current value forces revalidation', () => {
  assert.equal(rafaConfirmationGate({
    buttonId: 'confirm_yes',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    hasStateMismatch: true,
  }), 'revalidate')
})

test('audio longer than two minutes is rejected', () => {
  assert.equal(rafaAudioDurationDisposition(120), 'ok')
  assert.equal(rafaAudioDurationDisposition(121), 'too_long')
})

test('field confidence is evaluated independently', () => {
  assert.equal(RAFA_FIELD_CONFIDENCE_THRESHOLD, 0.85)
  assert.equal(rafaFieldNeedsReview(0.99), false)
  assert.equal(rafaFieldNeedsReview(0.84), true)
  assert.equal(rafaFieldNeedsReview(undefined), true)
})

test('product resolution order is fixed to the five required stages', () => {
  assert.deepEqual([...RAFA_PRODUCT_RESOLUTION_ORDER], [
    'ean',
    'supplier_product_map',
    'store_similarity',
    'catalog',
    'merchant_disambiguation',
  ])
})

test('webhook transcribes audio and routes transcript through deterministic text router', () => {
  const route = (readFileSync('app/api/whatsapp/webhook/route.ts', 'utf8') + readFileSync('lib/whatsapp-inbound.ts', 'utf8'))
  assert.match(route, /transcribeRafaAudio/)
  assert.match(route, /classifyWhatsAppText\(transcript\)/)
  assert.match(route, /media_duration_s/)
  assert.match(route, /Esse áudio passou de 2 minutos/)
  assert.match(route, /Não consegui transcrever esse áudio/)
})

test('image path reads the image first; only invoices go to the invoice flow, the rest goes to the agent', () => {
  const route = (readFileSync('app/api/whatsapp/webhook/route.ts', 'utf8') + readFileSync('lib/whatsapp-inbound.ts', 'utf8'))
  const invoice = readFileSync('lib/rafa-invoice.ts', 'utf8')
  assert.match(route, /readRafaImage/)
  assert.match(route, /reading\.classe === 'nota_fiscal'/)
  assert.match(route, /askRafaMediaConfirmation/)
  assert.match(route, /toAgent\('image'/)
  assert.match(invoice, /extractRafaInvoiceImages/)
  assert.ok(route.indexOf('readRafaImage({') < route.indexOf("toAgent('image'"))
})

test('supplier product map contains identity only and no store commercial data', () => {
  const migration = readFileSync('supabase/migrations/20260918_rafa_phase2.sql', 'utf8')
  const block = migration.match(/create table if not exists public\.supplier_product_map \([\s\S]*?\n\);/)?.[0] || ''
  assert.match(block, /fornecedor_cnpj/)
  assert.match(block, /codigo_fornecedor/)
  assert.match(block, /descricao_original/)
  assert.match(block, /produto_id/)
  assert.match(block, /ean/)
  assert.doesNotMatch(block, /store_id|custo|quantidade|preco|margem/i)
})

test('Rafa phase 2 operational copy excludes restricted topics', () => {
  const files = [
    'lib/rafa-confirm.ts',
    'lib/rafa-invoice.ts',
    'app/api/whatsapp/webhook/route.ts',
    'app/rafa/prateleira/page.tsx',
  ]
  const copy = files.map((file) => readFileSync(file, 'utf8')).join('\n')
  assert.doesNotMatch(copy, /cr[eé]dito|empr[eé]stimo|juros|antecipa[cç][aã]o/i)
})


test('AI outages never leave Rafa silent on free text or invoice confirmation', () => {
  const route = (readFileSync('app/api/whatsapp/webhook/route.ts', 'utf8') + readFileSync('lib/whatsapp-inbound.ts', 'utf8'))
  assert.match(route, /GROQ_API_KEY/)
  assert.match(route, /As respostas livres ainda não estão disponíveis agora/)
  assert.match(route, /A leitura automática da nota ainda não está disponível agora/)
  assert.match(route, /Não consegui processar essa nota agora/)
  assert.match(route, /processApprovedInvoiceMedia/)
})
