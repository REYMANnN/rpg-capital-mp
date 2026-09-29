import { createHash, randomUUID } from 'node:crypto'

import type { NextRequest } from 'next/server'

import { loadRafaStore } from '@/lib/inventory/rafa-store'
import { runWithRafaSink, type RafaSink } from '@/lib/rafa-sink'
import { createAdminClient } from '@/lib/supabase/admin'
import { processValue } from '@/lib/whatsapp-inbound'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Bateria de testes da Rafa 3.0. Roda mensagens "de mentira" pelo mesmo caminho do WhatsApp,
// mas as respostas ficam aqui (não saem pelo WhatsApp). O token só vale para a loja de teste
// e o número de teste gravados junto com ele (rafa_eval_tokens), então não mexe em loja real.

type Step =
  | { text: string }
  | { image: { base64: string; mime?: string }; caption?: string }
  | { button: 'confirm_yes' | 'confirm_no' }

async function authorize(request: NextRequest) {
  const token = request.headers.get('x-rafa-eval-token') || ''
  if (token.length < 32) return null
  const hash = createHash('sha256').update(token).digest('hex')
  const { data } = await createAdminClient().from('rafa_eval_tokens')
    .select('store_id,wa_id,expires_at').eq('token_hash', hash).maybeSingle()
  if (!data || new Date(String(data.expires_at)).getTime() < Date.now()) return null
  return { storeId: String(data.store_id), waId: String(data.wa_id) }
}

async function reset(storeId: string, waId: string) {
  const admin = createAdminClient()
  await Promise.all([
    admin.from('rafa_events').delete().eq('wa_id', waId),
    admin.from('rafa_pending_actions').delete().eq('wa_id', waId),
    admin.from('rafa_pending_products').delete().eq('store_id', storeId),
    admin.from('rafa_invoice_imports').delete().eq('store_id', storeId),
    admin.from('rafa_memory').delete().eq('store_id', storeId),
    admin.from('whatsapp_sessions').delete().eq('wa_id', waId),
    admin.from('rafa_daily_tips').delete().eq('wa_id', waId),
  ])
  await admin.from('rafa_operations').delete().eq('store_id', storeId)
  await admin.from('wa_store_bindings').upsert({ wa_id: waId, store_id: storeId, updated_at: new Date().toISOString() }, { onConflict: 'wa_id' })
}

export async function POST(request: NextRequest) {
  const scope = await authorize(request)
  if (!scope) return new Response('Unauthorized', { status: 401 })
  const body = await request.json().catch(() => null) as { reset?: boolean; steps?: Step[]; products?: string[] } | null
  if (!body) return Response.json({ error: 'invalid body' }, { status: 400 })
  if (body.reset) await reset(scope.storeId, scope.waId)

  const transcript: Array<{ step: unknown; replies: string[]; ms: number }> = []
  for (const step of (body.steps || []).slice(0, 12)) {
    const sink: RafaSink = { messages: [], media: {}, forceBrain: true }
    const id = `EVAL${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`
    const message: Record<string, unknown> = { id, from: scope.waId, timestamp: String(Math.floor(Date.now() / 1000)) }
    if ('text' in step) Object.assign(message, { type: 'text', text: { body: step.text } })
    else if ('image' in step) {
      sink.media[id] = { bytes: new Uint8Array(Buffer.from(step.image.base64, 'base64')), mime: step.image.mime || 'image/jpeg' }
      Object.assign(message, { type: 'image', image: { id: `evo:${id}`, mime_type: step.image.mime || 'image/jpeg', caption: step.caption || '' } })
    } else Object.assign(message, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: step.button, title: step.button === 'confirm_yes' ? 'Sim' : 'Não' } } })
    const started = Date.now()
    await runWithRafaSink(sink, () => processValue({ contacts: [{ wa_id: scope.waId, profile: { name: 'Eval' } }], messages: [message] }))
    transcript.push({
      step: 'image' in step ? { image: `${step.image.base64.length} b64 chars`, caption: step.caption } : step,
      replies: sink.messages.map((item) => item.body + (Array.isArray(item.payload.buttons) ? ` [botões: ${(item.payload.buttons as Array<{ title?: string }>).map((b) => b.title).join(' / ')}]` : '')),
      ms: Date.now() - started,
    })
  }

  const { state } = await loadRafaStore(scope.storeId)
  const watch = (body.products || []).map((term) => term.toLowerCase())
  const products = state.products.filter((product) => !product.deletedAt && (!watch.length || watch.some((term) => product.name.toLowerCase().includes(term) || product.barcode === term)))
    .slice(0, 40).map((product) => ({ nome: product.name, ean: product.barcode, preco: product.priceCents, estoque: product.stockMilli / 1000 }))
  const admin = createAdminClient()
  const [{ data: ops }, { data: pending }, { data: memory }] = await Promise.all([
    admin.from('rafa_operations').select('tool,summary,status,created_at').eq('store_id', scope.storeId).order('created_at', { ascending: false }).limit(10),
    admin.from('rafa_pending_products').select('name,status,price_cents').eq('store_id', scope.storeId).limit(40),
    admin.from('rafa_memory').select('fact,deleted_at').eq('store_id', scope.storeId).limit(40),
  ])
  return Response.json({ transcript, products, operations: ops || [], pendingProducts: pending || [], memory: memory || [] })
}
