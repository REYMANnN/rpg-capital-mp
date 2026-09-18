import { createHmac, timingSafeEqual } from 'node:crypto'
import { after } from 'next/server'

import { createClient } from '@supabase/supabase-js'
import { markAsRead, sendText } from '@/lib/whatsapp'
import { classifyWhatsAppText, replyForIntent, type WhatsAppIntent } from '@/lib/whatsapp-router'
import { sendMenu } from '@/lib/whatsapp-menu'
import { createBalcaoDeepLink } from '@/lib/deeplink'
import { flowIntent, interactiveButtonId, interactiveFlow } from '@/lib/whatsapp-interactive'
import { FLOW_LABEL } from '@/lib/whatsapp-flows'
import { classifyRafaImage, extractRafaActions, rafaAiBudgetAvailable, transcribeRafaAudio, type RafaMediaClass } from '@/lib/rafa-ai'
import { askRafaConfirmation, askRafaMediaConfirmation, confirmRafaPending, isTextConfirmationAttempt, refuseRafaPending } from '@/lib/rafa-confirm'
import { appendInvoiceMedia, processApprovedInvoiceMedia, unsupportedRafaClassMessage } from '@/lib/rafa-invoice'
import { downloadWhatsAppMedia, mediaDataUri, storeInvoiceProof } from '@/lib/rafa-media'
import { actionToChange, resolveTextProduct } from '@/lib/rafa-products'
import { loadRafaStore, type RafaChange } from '@/lib/inventory/rafa-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type JsonRecord = Record<string, any>

function isValidSignature(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader?.startsWith('sha256=')) return false
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`
  const receivedBuffer = Buffer.from(signatureHeader, 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  if (receivedBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(receivedBuffer, expectedBuffer)
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object') : []
}

function metaTimestamp(value: unknown) {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString()
}

function mediaId(message: JsonRecord) {
  if (message.type === 'image') return typeof message.image?.id === 'string' ? message.image.id : null
  if (message.type === 'audio') return typeof message.audio?.id === 'string' ? message.audio.id : null
  if (message.type === 'document') return typeof message.document?.id === 'string' ? message.document.id : null
  return null
}

function safeLogError(error: unknown, stage = 'processing', privateValues: string[] = []) {
  const fields = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const secrets = Object.entries(process.env)
    .filter(([name]) => /TOKEN|SECRET|KEY/.test(name))
    .map(([, value]) => value?.trim())
    .filter((value): value is string => Boolean(value))
  const redact = (value: unknown) => {
    if (typeof value !== 'string') return null
    let result = value
    for (const secret of [...secrets, ...privateValues].filter(Boolean).sort((a, b) => b.length - a.length)) {
      result = result.split(secret).join('[REDACTED]')
    }
    return result
      .replace(/Failing row contains \([\s\S]*?\)\.?/gi, 'Failing row contains [REDACTED]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
      .replace(/\bsha256=[a-f0-9]+\b/gi, 'sha256=[REDACTED]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED]')
      .replace(/\+?\d[\d ()-]{8,}\d/g, '[REDACTED]')
      .slice(0, 8000)
  }
  console.error('WhatsApp webhook processing failed', {
    stage,
    name: redact(fields.name) ?? 'Error',
    message: redact(fields.message ?? (typeof error === 'string' ? error : 'Unknown error')),
    stack: redact(fields.stack),
    code: redact(fields.code),
    details: redact(fields.details),
    hint: redact(fields.hint),
  })
}

function isWriteIntent(intent: WhatsAppIntent) {
  return intent === 'registrar_venda'
    || intent === 'entrada_estoque'
    || intent === 'alterar_preco'
    || intent === 'ajustar_estoque'
}

function candidateLines(candidates: Array<{ name: string; brand?: string; priceCents?: number; barcode: string }>) {
  return candidates.slice(0, 3).map((candidate, index) => {
    const price = candidate.priceCents != null
      ? ` · ${(candidate.priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
      : ''
    const brand = candidate.brand ? ` · ${candidate.brand}` : ''
    return `${index + 1}. ${candidate.name}${brand}${price} · EAN ${candidate.barcode}`
  }).join('\n')
}

async function processValue(value: JsonRecord) {
  const contacts = asArray(value.contacts)
  const privateValues: string[] = []
  const collectPrivateValues = (input: unknown): void => {
    if (typeof input === 'string') { privateValues.push(input); return }
    if (input && typeof input === 'object') for (const child of Object.values(input)) collectPrivateValues(child)
  }
  collectPrivateValues(value)

  const createDatabase = () => {
    const url = process.env.SUPABASE_URL?.trim()
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!url) throw new Error('SUPABASE_URL is not configured')
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  }
  const attempt = async (stage: string, action: () => Promise<unknown>) => {
    try { await action() } catch (error) { safeLogError(error, stage, privateValues) }
  }
  const sessionFor = async (waId: string) => {
    const { data } = await createDatabase().from('whatsapp_sessions')
      .select('store_id,payload,expires_at')
      .eq('wa_id', waId)
      .maybeSingle()
    if (!data || !data.store_id || new Date(data.expires_at).getTime() <= Date.now()) return null
    return data
  }

  const routeOperationalText = async (
    fromPhone: string,
    wamid: string,
    text: string,
    routing: ReturnType<typeof classifyWhatsAppText>,
  ) => {
    if (routing.intent === 'opt_out' || routing.intent === 'opt_in') {
      const result = await sendText(fromPhone, replyForIntent(routing.intent), { inReplyTo: wamid })
      if (!result.ok) throw new Error(result.error)
      return
    }

    if (isTextConfirmationAttempt(text)) {
      const { data: pending } = await createDatabase().from('rafa_pending_actions')
        .select('id')
        .eq('wa_id', fromPhone)
        .eq('status', 'pendente')
        .limit(1)
        .maybeSingle()
      if (pending) {
        const result = await sendText(fromPhone, 'preciso que você aperte o botão Sim pra eu confirmar.\n— Rafa', { inReplyTo: wamid })
        if (!result.ok) throw new Error(result.error)
        return
      }
    }

    const session = await sessionFor(fromPhone)
    const storeId = typeof session?.store_id === 'string' ? session.store_id : null

    if (routing.intent === 'produto_por_ean' && storeId) {
      const { state } = await loadRafaStore(storeId)
      const product = state.products.find((item) => item.barcode === routing.normalizedText && !item.deletedAt)
      const result = product
        ? await sendText(
            fromPhone,
            `${product.name}\nVenda: ${(product.priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\nEstoque: ${(product.stockMilli / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} un.\n— Rafa`,
            { inReplyTo: wamid },
          )
        : await sendText(fromPhone, 'Não encontrei esse produto na sua loja.\n— Rafa', { inReplyTo: wamid })
      if (!result.ok) throw new Error(result.error)
      return
    }

    if (isWriteIntent(routing.intent)) {
      if (!storeId) {
        const result = await sendMenu(fromPhone, 'Primeiro abra o fluxo da sua loja pelo menu.', { inReplyTo: wamid })
        if (!result.ok) throw new Error(result.error)
        return
      }

      const budget = await rafaAiBudgetAvailable(storeId)
      if (!budget.allowed) {
        const result = await sendMenu(fromPhone, 'O limite de respostas livres de hoje foi atingido. Os botões continuam funcionando normalmente; respostas livres voltam amanhã.', { inReplyTo: wamid })
        if (!result.ok) throw new Error(result.error)
        return
      }

      const { state } = await loadRafaStore(storeId)
      const extracted = await extractRafaActions({
        storeId,
        waId: fromPhone,
        text,
        intent: routing.intent,
        products: state.products,
        history: [],
      })

      if (!Array.isArray(extracted.actions) || !extracted.actions.length) {
        const result = await sendText(fromPhone, 'Não consegui identificar todos os dados dessa alteração. Me explica de novo com produto e valor ou quantidade.\n— Rafa', { inReplyTo: wamid })
        if (!result.ok) throw new Error(result.error)
        return
      }

      const changes: RafaChange[] = []
      for (const action of extracted.actions) {
        const resolution = resolveTextProduct(state.products, String(action.referencia_produto || ''))
        if (resolution.status === 'ambiguous') {
          const result = await sendText(
            fromPhone,
            `Encontrei mais de um produto parecido. Qual deles é?\n${candidateLines(resolution.candidates)}\n— Rafa`,
            { inReplyTo: wamid },
          )
          if (!result.ok) throw new Error(result.error)
          return
        }
        if (resolution.status !== 'resolved' || !resolution.candidate.id) {
          const result = await sendText(fromPhone, `Não encontrei com segurança o produto “${String(action.referencia_produto || '').slice(0, 80)}”. Me diga o nome ou EAN de outro jeito.\n— Rafa`, { inReplyTo: wamid })
          if (!result.ok) throw new Error(result.error)
          return
        }
        const product = state.products.find((item) => item.id === resolution.candidate.id)
        if (!product) continue
        const change = actionToChange(action, product)
        if (!change) {
          const result = await sendText(fromPhone, 'Faltou um valor necessário para essa alteração. Me explica de novo.\n— Rafa', { inReplyTo: wamid })
          if (!result.ok) throw new Error(result.error)
          return
        }
        changes.push(change)
      }

      const result = await askRafaConfirmation({
        waId: fromPhone,
        storeId,
        changes,
        state,
        inReplyTo: wamid,
      })
      if (!result.ok) throw new Error(result.error)
      return
    }

    if (routing.intent === 'consulta') {
      const result = await sendText(fromPhone, replyForIntent(routing.intent), { inReplyTo: wamid })
      if (!result.ok) throw new Error(result.error)
      return
    }

    const result = await sendMenu(fromPhone, undefined, { inReplyTo: wamid })
    if (!result.ok) throw new Error(result.error)
  }

  for (const message of asArray(value.messages)) {
    const wamid = typeof message.id === 'string' ? message.id : ''
    const fromPhone = typeof message.from === 'string' ? message.from : ''
    if (!wamid || !fromPhone) continue

    const contact = contacts.find((item) => item.wa_id === fromPhone)
    const profileName = typeof contact?.profile?.name === 'string' ? contact.profile.name : null
    const rawText = message.type === 'text' && typeof message.text?.body === 'string' ? message.text.body : null
    let routedText = rawText
    let transcript: string | null = null
    let mediaMime: string | null = null
    let mediaDurationS: number | null = null
    let intentValue: string | null = null
    const now = new Date().toISOString()

    const buttonId = interactiveButtonId(message)
    const flow = interactiveFlow(message)

    if (buttonId === 'confirm_yes') {
      intentValue = 'confirm_yes'
      await attempt('confirm_yes', async () => {
        const result = await confirmRafaPending(fromPhone)
        if (result.kind === 'media') {
          await processApprovedInvoiceMedia({ waId: fromPhone, storeId: result.storeId, importId: result.importId })
          return
        }
        if (result.kind === 'applied') {
          const sent = await sendText(fromPhone, 'Pronto. Alteração confirmada e registrada.\n— Rafa', { inReplyTo: wamid })
          if (!sent.ok) throw new Error(sent.error)
          const menu = await sendMenu(fromPhone)
          if (!menu.ok) throw new Error(menu.error)
          return
        }
        if (result.kind === 'none') {
          const sent = await sendText(fromPhone, 'Não há nenhuma alteração aguardando confirmação.\n— Rafa', { inReplyTo: wamid })
          if (!sent.ok) throw new Error(sent.error)
        }
      })
    } else if (buttonId === 'confirm_no') {
      intentValue = 'confirm_no'
      await attempt('confirm_no', async () => {
        const result = await refuseRafaPending(fromPhone)
        if (!result.ok) throw new Error(result.error)
      })
    } else if (flow) {
      intentValue = flowIntent(flow)
      await attempt('button_reply', async () => {
        let storeId: string | undefined
        try {
          const { data } = await createDatabase().from('whatsapp_sessions').select('store_id').eq('wa_id', fromPhone).maybeSingle()
          if (typeof data?.store_id === 'string') storeId = data.store_id
        } catch {}

        const link = await createBalcaoDeepLink({ waId: fromPhone, storeId, fluxo: flow })
        const result = await sendText(
          fromPhone,
          `${FLOW_LABEL[flow]}: abra o Balcão por este link (válido por 10 minutos):\n${link.url}\n— Rafa`,
          { inReplyTo: wamid },
        )
        if (!result.ok) throw new Error(result.error)

        const row: Record<string, unknown> = {
          wa_id: fromPhone,
          fluxo_atual: flow,
          etapa: 'link_enviado',
          payload: { button_id: intentValue, jti: link.jti },
          updated_at: now,
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        }
        if (storeId) row.store_id = storeId
        const { error } = await createDatabase().from('whatsapp_sessions').upsert(row, { onConflict: 'wa_id' })
        if (error) throw error
      })
    } else if (message.type === 'audio') {
      intentValue = 'audio'
      await attempt('audio', async () => {
        const session = await sessionFor(fromPhone)
        const storeId = typeof session?.store_id === 'string' ? session.store_id : null
        if (!storeId) {
          const menu = await sendMenu(fromPhone, 'Primeiro abra o fluxo da sua loja pelo menu.', { inReplyTo: wamid })
          if (!menu.ok) throw new Error(menu.error)
          return
        }

        const id = mediaId(message)
        if (!id) throw new Error('audio_media_id_missing')
        const media = await downloadWhatsAppMedia(id)
        mediaMime = media.mime
        try {
          const transcribed = await transcribeRafaAudio({
            storeId,
            waId: fromPhone,
            bytes: media.bytes,
            mime: media.mime,
            filename: media.filename,
          })
          transcript = transcribed.text
          mediaDurationS = Math.round(transcribed.durationSeconds)
        } catch (error) {
          if (error instanceof Error && error.message === 'rafa_ai_budget_exceeded') {
            const menu = await sendMenu(fromPhone, 'O limite de respostas livres de hoje foi atingido. Os botões continuam funcionando normalmente; respostas livres voltam amanhã.', { inReplyTo: wamid })
            if (!menu.ok) throw new Error(menu.error)
            return
          }
          const sent = await sendText(fromPhone, 'Não consegui transcrever esse áudio. Tente mandar de novo ou escreva por texto.\n— Rafa', { inReplyTo: wamid })
          if (!sent.ok) throw new Error(sent.error)
          return
        }

        if ((mediaDurationS || 0) > 120) {
          const sent = await sendText(fromPhone, 'Esse áudio passou de 2 minutos. Me manda um áudio mais curto ou escreve por texto.\n— Rafa', { inReplyTo: wamid })
          if (!sent.ok) throw new Error(sent.error)
          return
        }
        if (!transcript) {
          const sent = await sendText(fromPhone, 'Não consegui entender o áudio. Tente mandar de novo ou escreva por texto.\n— Rafa', { inReplyTo: wamid })
          if (!sent.ok) throw new Error(sent.error)
          return
        }

        routedText = transcript
        const routing = classifyWhatsAppText(transcript)
        intentValue = routing.intent
        await routeOperationalText(fromPhone, wamid, transcript, routing)
      })
    } else if (message.type === 'image' || (message.type === 'document' && String(message.document?.mime_type || '').includes('pdf'))) {
      intentValue = 'media'
      await attempt('media', async () => {
        const session = await sessionFor(fromPhone)
        const storeId = typeof session?.store_id === 'string' ? session.store_id : null
        if (!storeId) {
          const menu = await sendMenu(fromPhone, 'Primeiro abra o fluxo da sua loja pelo menu.', { inReplyTo: wamid })
          if (!menu.ok) throw new Error(menu.error)
          return
        }

        const id = mediaId(message)
        if (!id) throw new Error('media_id_missing')
        const filenameHint = message.type === 'document' ? message.document?.filename : null
        const media = await downloadWhatsAppMedia(id, filenameHint)
        mediaMime = media.mime
        const dataUri = mediaDataUri(media)

        let classification: { classe: RafaMediaClass; descricao: string; fornecedor_nome?: string | null }
        try {
          classification = await classifyRafaImage({ storeId, waId: fromPhone, dataUri })
        } catch (error) {
          if (error instanceof Error && error.message === 'rafa_ai_budget_exceeded') {
            const menu = await sendMenu(fromPhone, 'O limite de respostas livres de hoje foi atingido. Os botões continuam funcionando normalmente; respostas livres voltam amanhã.', { inReplyTo: wamid })
            if (!menu.ok) throw new Error(menu.error)
            return
          }
          const hint = `${String(filenameHint || '')} ${String(message.document?.caption || '')}`.toLowerCase()
          classification = /danfe|nfe|nf-e|nota/.test(hint)
            ? { classe: 'nota_fiscal', descricao: 'documento PDF que parece ser uma nota fiscal' }
            : { classe: 'outro', descricao: media.mime === 'application/pdf' ? 'documento PDF' : 'imagem não classificada' }
        }
        intentValue = `media_${classification.classe}`

        if (classification.classe !== 'nota_fiscal') {
          const sent = await sendText(fromPhone, unsupportedRafaClassMessage(classification.classe), { inReplyTo: wamid })
          if (!sent.ok) throw new Error(sent.error)
          const menu = await sendMenu(fromPhone)
          if (!menu.ok) throw new Error(menu.error)
          return
        }

        const mediaPath = await storeInvoiceProof({ storeId, waId: fromPhone, media })
        const appended = await appendInvoiceMedia({
          waId: fromPhone,
          storeId,
          mediaPath,
          classification,
        })
        const supplier = classification.fornecedor_nome ? ` da ${classification.fornecedor_nome}` : ''
        const pageText = appended.pageCount > 1 ? ` Recebi ${appended.pageCount} fotos dessa nota.` : ''
        const result = await askRafaMediaConfirmation({
          waId: fromPhone,
          storeId,
          importId: appended.importId,
          message: `Parece uma nota fiscal${supplier}.${pageText} Quer que eu suba esses produtos para a prateleira?\n— Rafa`,
          inReplyTo: wamid,
        })
        if (!result.ok) throw new Error(result.error)
      })
    } else if (rawText !== null) {
      const routing = classifyWhatsAppText(rawText)
      intentValue = routing.intent
      await attempt('reply', () => routeOperationalText(fromPhone, wamid, rawText, routing))
    }

    await attempt('mark_read', async () => {
      const result = await markAsRead(wamid)
      if (!result.ok) throw new Error(result.error)
    })

    const routingForConsent = routedText !== null ? classifyWhatsAppText(routedText) : { intent: 'desconhecida' as WhatsAppIntent, normalizedText: null }
    await attempt('persist_contact', async () => {
      const consent = routingForConsent.intent === 'opt_out'
        ? { opted_out: true, opted_out_at: now }
        : routingForConsent.intent === 'opt_in'
          ? { opted_out: false, opted_out_at: null, opted_in: true, opted_in_at: now }
          : {}
      const { error } = await createDatabase().from('whatsapp_contacts').upsert({
        wa_id: fromPhone,
        profile_name: profileName,
        updated_at: now,
        ...consent,
      }, { onConflict: 'wa_id' })
      if (error) throw error
    })

    await attempt('persist_inbound', async () => {
      const normalized = routedText !== null ? classifyWhatsAppText(routedText).normalizedText : null
      const { error } = await createDatabase().from('whatsapp_inbound_messages').upsert({
        wamid,
        from_phone: fromPhone,
        profile_name: profileName,
        type: typeof message.type === 'string' ? message.type : 'unknown',
        text_body: rawText,
        transcript,
        text_normalized: normalized,
        intent: intentValue,
        media_id: mediaId(message),
        media_mime: mediaMime || (message.audio?.mime_type ?? message.image?.mime_type ?? message.document?.mime_type ?? null),
        media_duration_s: mediaDurationS,
        raw: message,
        received_at: metaTimestamp(message.timestamp),
      }, { onConflict: 'wamid', ignoreDuplicates: true })
      if (error) throw error
    })
  }

  for (const status of asArray(value.statuses)) {
    if (typeof status.id !== 'string' || !status.id) continue
    await attempt('persist_status', async () => {
      const { error } = await createDatabase().from('whatsapp_message_status').insert({
        wamid: status.id,
        status: typeof status.status === 'string' ? status.status : 'unknown',
        recipient: typeof status.recipient_id === 'string' ? status.recipient_id : null,
        status_at: metaTimestamp(status.timestamp),
        errors: Array.isArray(status.errors) ? status.errors : null,
        raw: status,
      })
      if (error) throw error
    })
  }
}

async function processPayload(payload: JsonRecord) {
  for (const entry of asArray(payload.entry)) {
    for (const change of asArray(entry.changes)) {
      if (change.value && typeof change.value === 'object') await processValue(change.value)
    }
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const verifyToken = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge') ?? ''
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim()

  if (mode === 'subscribe' && expectedToken && verifyToken === expectedToken) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  return new Response('Forbidden', { status: 403 })
}

export async function POST(req: Request) {
  console.info('WhatsApp webhook runtime configuration', {
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL?.trim()),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    GROQ_API_KEY: Boolean(process.env.GROQ_API_KEY?.trim()),
  })

  const rawBody = await req.text()
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim()
  const signature = req.headers.get('x-hub-signature-256')
  if (!appSecret || !isValidSignature(rawBody, signature, appSecret)) return new Response('OK', { status: 200 })

  let payload: JsonRecord
  try {
    payload = JSON.parse(rawBody) as JsonRecord
  } catch {
    safeLogError(new Error('Invalid WhatsApp JSON payload'), 'parse')
    return new Response('OK', { status: 200 })
  }

  after(async () => {
    try { await processPayload(payload) } catch (error) { safeLogError(error) }
  })
  return new Response('OK', { status: 200 })
}
