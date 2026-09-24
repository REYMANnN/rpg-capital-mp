import { createHmac, timingSafeEqual } from 'node:crypto'
import { after } from 'next/server'

import { processPayload, safeLogError, type JsonRecord } from '@/lib/whatsapp-inbound'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isValidSignature(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader?.startsWith('sha256=')) return false
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`
  const receivedBuffer = Buffer.from(signatureHeader, 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  if (receivedBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(receivedBuffer, expectedBuffer)
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
