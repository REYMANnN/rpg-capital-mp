import { NextResponse } from 'next/server'
import { processWhatsAppWebhook } from '@/lib/whatsapp/handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const verifyToken = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  const expected = process.env.META_WHATSAPP_VERIFY_TOKEN?.trim()

  if (mode === 'subscribe' && expected && verifyToken === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return new Response('Forbidden', { status: 403 })
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null)
  if (!payload) return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })

  try {
    const result = await processWhatsAppWebhook(payload)
    return NextResponse.json(result)
  } catch (error) {
    console.error('BALCAO WhatsApp webhook failed', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
