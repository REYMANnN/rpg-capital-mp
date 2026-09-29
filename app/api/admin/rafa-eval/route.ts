import { createHash, randomUUID } from 'node:crypto'

import type { NextRequest } from 'next/server'

import { loadRafaStore } from '@/lib/inventory/rafa-store'
import { claudePing } from '@/lib/llm/claude'
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
  | { audio: { base64: string; mime?: string } }
  | { together: Step[] }
  | { document: { base64: string; mime: string; filename: string }; caption?: string }
  | { button: 'confirm_yes' | 'confirm_no' }

const EVAL_TEMPLATE_STORE_ID = '9650d7a0-a29b-4fc5-a0fa-5bd318e4f782'

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
  // Volta a loja de teste ao catálogo-base (cópia da loja modelo, sem vendas nem movimentos).
  const { data: evalStore } = await admin.from('inventory_v1_stores').select('installation_id').eq('id', storeId).maybeSingle()
  if (evalStore?.installation_id) {
    const { state: template } = await loadRafaStore(EVAL_TEMPLATE_STORE_ID)
    const products = template.products.filter((product) => !product.deletedAt).map((product) => ({ ...product, id: randomUUID() }))
    const { error } = await admin.rpc('inventory_v1_sync_state', { p_installation_id: evalStore.installation_id, p_state: { products, sales: [], movements: [], scaleRule: template.scaleRule || {} }, p_app_version: 'rafa-eval' })
    if (error) throw error
  }
  await admin.from('wa_store_bindings').upsert({ wa_id: waId, store_id: storeId, updated_at: new Date().toISOString() }, { onConflict: 'wa_id' })
}

export async function POST(request: NextRequest) {
  const scope = await authorize(request)
  if (!scope) return new Response('Unauthorized', { status: 401 })
  const body = await request.json().catch(() => null) as { reset?: boolean; steps?: Step[]; products?: string[] } | null
  if (!body) return Response.json({ error: 'invalid body' }, { status: 400 })
  if ((body as { ping?: boolean }).ping) return Response.json(await claudePing().catch((error) => ({ error: error instanceof Error ? error.message : String(error) })))
  if (body.reset) await reset(scope.storeId, scope.waId)

  const transcript: Array<{ step: unknown; replies: string[]; errors?: string[]; ms: number }> = []
  const toMessage = (step: Step, sink: RafaSink) => {
    const id = `EVAL${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`
    const message: Record<string, unknown> = { id, from: scope.waId, timestamp: String(Math.floor(Date.now() / 1000)) }
    if ('text' in step) Object.assign(message, { type: 'text', text: { body: step.text } })
    else if ('image' in step) {
      sink.media[id] = { bytes: new Uint8Array(Buffer.from(step.image.base64, 'base64')), mime: step.image.mime || 'image/jpeg' }
      Object.assign(message, { type: 'image', image: { id: `evo:${id}`, mime_type: step.image.mime || 'image/jpeg', caption: step.caption || '' } })
    } else if ('audio' in step) {
      sink.media[id] = { bytes: new Uint8Array(Buffer.from(step.audio.base64, 'base64')), mime: step.audio.mime || 'audio/ogg', fileName: 'audio.ogg' }
      Object.assign(message, { type: 'audio', audio: { id: `evo:${id}`, mime_type: step.audio.mime || 'audio/ogg; codecs=opus' } })
    } else if ('document' in step) {
      sink.media[id] = { bytes: new Uint8Array(Buffer.from(step.document.base64, 'base64')), mime: step.document.mime, fileName: step.document.filename }
      Object.assign(message, { type: 'document', document: { id: `evo:${id}`, mime_type: step.document.mime, filename: step.document.filename, caption: step.caption || '' } })
    } else if ('button' in step) Object.assign(message, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: step.button, title: step.button === 'confirm_yes' ? 'Sim' : 'Não' } } })
    return message
  }
  const describe = (step: Step): unknown => 'image' in step ? { image: `${step.image.base64.length} b64 chars`, caption: step.caption }
    : 'audio' in step ? { audio: `${step.audio.base64.length} b64 chars` }
    : 'document' in step ? { document: step.document.filename, caption: step.caption }
    : 'together' in step ? { together: step.together.map(describe) } : step
  const send = (message: Record<string, unknown>) => processValue({ contacts: [{ wa_id: scope.waId, profile: { name: 'Eval' } }], messages: [message] })

  for (const step of (body.steps || []).slice(0, 12)) {
    const sink: RafaSink = { messages: [], media: {}, forceBrain: true, errors: [] }
    const started = Date.now()
    if ('together' in step) {
      // Várias mensagens quase juntas (ex.: 2 fotos da mesma nota), como o WhatsApp entrega.
      const messages = step.together.slice(0, 4).map((inner) => toMessage(inner, sink))
      await runWithRafaSink(sink, () => Promise.all(messages.map((message, index) =>
        new Promise((resolve) => setTimeout(resolve, index * 900)).then(() => send(message)))))
    } else {
      const message = toMessage(step, sink)
      await runWithRafaSink(sink, () => send(message))
    }
    transcript.push({
      step: describe(step),
      replies: sink.messages.map((item) => item.body + (Array.isArray(item.payload.buttons) ? ` [botões: ${(item.payload.buttons as Array<{ title?: string }>).map((b) => b.title).join(' / ')}]` : '')),
      ...(sink.errors?.length ? { errors: sink.errors } : {}),
      ms: Date.now() - started,
    })
  }

  const { state } = await loadRafaStore(scope.storeId)
  const watch = (body.products || []).map((term) => term.toLowerCase())
  const products = state.products.filter((product) => !product.deletedAt && (!watch.length || watch.some((term) => product.name.toLowerCase().includes(term) || product.barcode === term)))
    .slice(0, 40).map((product) => ({ nome: product.name, ean: product.barcode, preco: product.priceCents, estoque: product.stockMilli / 1000 }))
  const admin = createAdminClient()
  const [{ data: ops }, { data: pending }, { data: memory }, { data: aiErrors }] = await Promise.all([
    admin.from('rafa_operations').select('tool,summary,status,created_at').eq('store_id', scope.storeId).order('created_at', { ascending: false }).limit(10),
    admin.from('rafa_pending_products').select('name,status,price_cents').eq('store_id', scope.storeId).limit(40),
    admin.from('rafa_memory').select('fact,deleted_at').eq('store_id', scope.storeId).limit(40),
    admin.from('rafa_ai_errors').select('*').eq('store_id', scope.storeId).order('created_at', { ascending: false }).limit(5),
  ])
  const sales = state.sales.slice(-10).map((sale) => ({ total: sale.totalCents, pagamento: sale.payment?.method || null, lucro: sale.grossProfitCents ?? null, itens: sale.items.length }))
  return Response.json({ transcript, products, sales, operations: ops || [], pendingProducts: pending || [], memory: memory || [], aiErrors: (aiErrors || []).map((row: Record<string, unknown>) => ({ ...row, raw: String(row.raw || '').slice(0, 600) })) })
}
