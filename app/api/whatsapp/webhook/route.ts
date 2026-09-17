import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { parseWhatsAppWebhook } from '@/lib/whatsapp/onboarding'
import { getSupabaseUrl } from '@/lib/supabase/config'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Reply =
  | { type: 'text'; body: string }
  | { type: 'buttons'; body: string; buttons: Array<{ id: string; title: string }> }

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function verifyMetaSignature(rawBody: string, signature: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim()
  if (!secret || !signature?.startsWith('sha256=')) return false
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  return safeEqual(signature, expected)
}

async function processInSupabase(input: { messageId: string; from: string; kind: 'text' | 'button'; value: string }) {
  const oidcToken = process.env.VERCEL_OIDC_TOKEN?.trim()
  if (!oidcToken) throw new Error('VERCEL_OIDC_TOKEN is not available')

  const response = await fetch(`${getSupabaseUrl()}/functions/v1/balcao-whatsapp-webhook`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${oidcToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  })

  const body = await response.json().catch(() => ({})) as { reply?: Reply; error?: string }
  if (!response.ok) throw new Error(body.error || `WhatsApp persistence failed (${response.status})`)
  return body.reply ?? null
}

async function sendWhatsApp(to: string, reply: Reply) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  const version = process.env.WHATSAPP_GRAPH_VERSION?.trim()
  if (!accessToken || !phoneNumberId || !version) {
    throw new Error('WhatsApp Cloud API credentials are not configured')
  }
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('WHATSAPP_GRAPH_VERSION is invalid')

  const payload = reply.type === 'text'
    ? {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: reply.body },
      }
    : {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: reply.body },
          action: {
            buttons: reply.buttons.slice(0, 3).map((button) => ({
              type: 'reply',
              reply: { id: button.id, title: button.title.slice(0, 20) },
            })),
          },
        },
      }

  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    console.error('BALCAO WhatsApp send failed', { status: response.status, body: errorBody.slice(0, 300) })
    throw new Error(`WhatsApp send failed (${response.status})`)
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token') || ''
  const challenge = url.searchParams.get('hub.challenge') || ''
  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || ''

  if (mode === 'subscribe' && expected && safeEqual(token, expected)) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return new Response('Forbidden', { status: 403 })
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  if (!verifyMetaSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody || 'null') as unknown
  const messages = parseWhatsAppWebhook(payload)
  if (!messages.length) return NextResponse.json({ ok: true, processed: 0 })

  try {
    for (const message of messages) {
      const reply = await processInSupabase(message)
      if (reply) await sendWhatsApp(message.from, reply)
    }
    return NextResponse.json({ ok: true, processed: messages.length })
  } catch (error) {
    console.error('BALCAO WhatsApp webhook processing failed', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
