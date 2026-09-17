import { createHmac, timingSafeEqual } from 'node:crypto'
import { after } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { markAsRead, sendText } from '@/lib/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STOP_REPLY = 'Pronto, você não vai mais receber mensagens da RPG Capital. Para voltar, mande VOLTAR.'
const TEST_REPLY = 'Recebido ✅ Em breve o Balcão RPG vai funcionar por aqui.'

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

function safeLogError(error: unknown) {
  console.error('WhatsApp webhook processing failed', {
    name: error instanceof Error ? error.name : 'UnknownError',
  })
}

async function processValue(value: JsonRecord) {
  const supabase = createAdminClient()
  const contacts = asArray(value.contacts)

  for (const message of asArray(value.messages)) {
    const wamid = typeof message.id === 'string' ? message.id : ''
    const fromPhone = typeof message.from === 'string' ? message.from : ''
    if (!wamid || !fromPhone) continue

    const contact = contacts.find((item) => item.wa_id === fromPhone) ?? contacts[0]
    const profileName = typeof contact?.profile?.name === 'string' ? contact.profile.name : null
    const now = new Date().toISOString()

    const { error: contactError } = await supabase
      .from('whatsapp_contacts')
      .upsert({ wa_id: fromPhone, profile_name: profileName, updated_at: now }, { onConflict: 'wa_id' })
    if (contactError) throw contactError

    const textBody = message.type === 'text' && typeof message.text?.body === 'string' ? message.text.body : null
    const { error: inboundError } = await supabase
      .from('whatsapp_inbound_messages')
      .upsert({
        wamid,
        from_phone: fromPhone,
        profile_name: profileName,
        type: typeof message.type === 'string' ? message.type : 'unknown',
        text_body: textBody,
        media_id: mediaId(message),
        raw: message,
        received_at: metaTimestamp(message.timestamp),
      }, { onConflict: 'wamid', ignoreDuplicates: true })
    if (inboundError) throw inboundError

    if (textBody === null) continue

    const command = textBody.trim().toUpperCase()
    await markAsRead(wamid)

    if (command === 'PARAR') {
      await sendText(fromPhone, STOP_REPLY)
      const { error: optOutError } = await supabase
        .from('whatsapp_contacts')
        .update({ opted_out: true, opted_out_at: now, updated_at: now })
        .eq('wa_id', fromPhone)
      if (optOutError) throw optOutError
      continue
    }

    if (command === 'VOLTAR') {
      const { error: optInError } = await supabase
        .from('whatsapp_contacts')
        .update({ opted_out: false, opted_out_at: null, opted_in: true, opted_in_at: now, updated_at: now })
        .eq('wa_id', fromPhone)
      if (optInError) throw optInError
      continue
    }

    await sendText(fromPhone, TEST_REPLY)
  }

  const statusRows = asArray(value.statuses).flatMap((status) => {
    const wamid = typeof status.id === 'string' ? status.id : ''
    if (!wamid) return []
    return [{
      wamid,
      status: typeof status.status === 'string' ? status.status : 'unknown',
      recipient: typeof status.recipient_id === 'string' ? status.recipient_id : null,
      status_at: metaTimestamp(status.timestamp),
      errors: Array.isArray(status.errors) ? status.errors : null,
      raw: status,
    }]
  })

  if (statusRows.length) {
    const { error: statusError } = await supabase.from('whatsapp_message_status').insert(statusRows)
    if (statusError) throw statusError
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
  const rawBody = await req.text()
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim()
  const signature = req.headers.get('x-hub-signature-256')

  if (!appSecret || !isValidSignature(rawBody, signature, appSecret)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: JsonRecord
  try {
    payload = JSON.parse(rawBody) as JsonRecord
  } catch (error) {
    safeLogError(error)
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
