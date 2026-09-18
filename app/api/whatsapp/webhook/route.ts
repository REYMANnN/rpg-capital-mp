import { createHmac, timingSafeEqual } from 'node:crypto'
import { after } from 'next/server'

import { createClient } from '@supabase/supabase-js'
import { markAsRead, sendText } from '@/lib/whatsapp'
import { classifyWhatsAppText, replyForIntent } from '@/lib/whatsapp-router'
import { sendMenu } from '@/lib/whatsapp-menu'
import { createBalcaoDeepLink } from '@/lib/deeplink'
import { flowIntent, interactiveFlow } from '@/lib/whatsapp-interactive'
import { FLOW_LABEL } from '@/lib/whatsapp-flows'

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

async function processValue(value: JsonRecord) {
  const contacts = asArray(value.contacts)
  // Collect payload strings only for redaction; never emit the payload in logs.
  const privateValues: string[] = []
  const collectPrivateValues = (input: unknown): void => {
    if (typeof input === 'string') { privateValues.push(input); return }
    if (input && typeof input === 'object') {
      for (const child of Object.values(input)) collectPrivateValues(child)
    }
  }
  collectPrivateValues(value)

  // Lazy, request-scoped construction, reached only after the immediate reply.
  // Keep the shared Balcao admin client unchanged.
  const createDatabase = () => {
    const url = process.env.SUPABASE_URL?.trim()
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!url) throw new Error('SUPABASE_URL is not configured')
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  }
  const attempt = async (stage: string, action: () => Promise<unknown>) => {
    try { await action() }
    catch (error) { safeLogError(error, stage, privateValues) }
  }

  for (const message of asArray(value.messages)) {
    const wamid = typeof message.id === 'string' ? message.id : ''
    const fromPhone = typeof message.from === 'string' ? message.from : ''
    if (!wamid || !fromPhone) continue
    const contact = contacts.find((item) => item.wa_id === fromPhone)
    const profileName = typeof contact?.profile?.name === 'string' ? contact.profile.name : null
    const textBody = message.type === 'text' && typeof message.text?.body === 'string' ? message.text.body : null
    const flow = interactiveFlow(message)
    const routing = textBody !== null
      ? classifyWhatsAppText(textBody)
      : { intent: 'desconhecida' as const, normalizedText: null }
    const intentValue = flow ? flowIntent(flow) : routing.intent
    const now = new Date().toISOString()

    if (flow) {
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
    } else if (textBody !== null) {
      await attempt('reply', async () => {
        if (routing.intent === 'opt_out' || routing.intent === 'opt_in') {
          // Only an immediate reply to this signed inbound message bypasses the
          // proactive-send opt-out lookup. This does not grant marketing consent.
          const result = await sendText(fromPhone, replyForIntent(routing.intent), { inReplyTo: wamid })
          if (!result.ok) throw new Error(result.error)
          return
        }

        const result = await sendMenu(fromPhone)
        if (!result.ok) throw new Error(result.error)
      })
    }

    if (textBody !== null || flow) {
      await attempt('mark_read', async () => {
        const result = await markAsRead(wamid)
        if (!result.ok) throw new Error(result.error)
      })
    }

    // Each database failure is isolated from replies and from other records.
    await attempt('persist_contact', async () => {
      const consent = routing.intent === 'opt_out'
        ? { opted_out: true, opted_out_at: now }
        : routing.intent === 'opt_in'
          ? { opted_out: false, opted_out_at: null, opted_in: true, opted_in_at: now }
          : {}
      const { error } = await createDatabase().from('whatsapp_contacts').upsert({
        wa_id: fromPhone, profile_name: profileName, updated_at: now, ...consent,
      }, { onConflict: 'wa_id' })
      if (error) throw error
    })
    await attempt('persist_inbound', async () => {
      const { error } = await createDatabase().from('whatsapp_inbound_messages').upsert({
        wamid,
        from_phone: fromPhone,
        profile_name: profileName,
        type: typeof message.type === 'string' ? message.type : 'unknown',
        text_body: textBody,
        text_normalized: routing.normalizedText,
        intent: intentValue,
        media_id: mediaId(message),
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
  })
  const rawBody = await req.text()
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim()
  const signature = req.headers.get('x-hub-signature-256')

  if (!appSecret || !isValidSignature(rawBody, signature, appSecret)) {
    // Acknowledge invalid deliveries but never schedule or process them.
    return new Response('OK', { status: 200 })
  }

  let payload: JsonRecord
  try {
    payload = JSON.parse(rawBody) as JsonRecord
  } catch {
    // JSON parser errors can contain fragments of the message body.
    safeLogError(new Error('Invalid WhatsApp JSON payload'), 'parse')
    return new Response('OK', { status: 200 })
  }

  after(async () => {
    try {
      await processPayload(payload)
    } catch (error) {
      safeLogError(error)
    }
  })

  return new Response('OK', { status: 200 })
}

