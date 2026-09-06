import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { forwardMalvoWebhookToEdge } from '@/lib/malvo/edgeRuntime'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

function safeEqual(value: string, expected: string) {
  const left = Buffer.from(value)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

function authorized(request: Request) {
  const secret = process.env.MALVO_WEBHOOK_SECRET?.trim()
  if (!secret) return false
  const header = request.headers.get('authorization') || ''
  if (!header.startsWith('Bearer ')) return false
  if (!safeEqual(header.slice(7), secret)) return false

  const allowedIp = process.env.MALVO_WEBHOOK_EGRESS_IP?.trim()
  if (allowedIp) {
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || ''
    if (forwarded !== allowedIp) return false
  }
  return true
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!payload || typeof payload.event !== 'string' || typeof payload.eventId !== 'string') {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
  }

  try {
    const result = await forwardMalvoWebhookToEdge(request, payload)
    return NextResponse.json(result, { status: result.accepted ? 202 : 200 })
  } catch (caught) {
    console.error('BALCAO Malvo webhook forwarding failed', caught)
    // Return a retriable status: Malvo reuses eventId on delivery retries, while
    // the Edge journal guarantees idempotency once an attempt is accepted.
    return NextResponse.json({ error: 'Webhook forwarding failed' }, { status: 503 })
  }
}
