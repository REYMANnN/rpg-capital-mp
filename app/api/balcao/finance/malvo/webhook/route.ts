import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { collectMalvoSnapshot } from '@/lib/malvo/managementSync'
import { parseMalvoClientUserId } from '@/lib/malvo/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SYNC_EVENTS = new Set([
  'item/created',
  'item/updated',
  'transactions/created',
  'transactions/updated',
])

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

function validUuid(value: unknown) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await request.json().catch(() => null) as Record<string, any> | null
  if (!payload || typeof payload.event !== 'string' || !validUuid(payload.eventId)) {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
  }

  const eventType = payload.event
  const itemId = typeof payload.itemId === 'string' ? payload.itemId : ''
  const clientUserId = typeof payload.clientUserId === 'string' ? payload.clientUserId : ''

  // `all` also delivers connector-level events. They have no Balcao Item and
  // do not mutate a merchant's financial snapshot.
  if (!itemId || !clientUserId) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const context = parseMalvoClientUserId(clientUserId)
  if (!context) return NextResponse.json({ error: 'Invalid Balcao clientUserId' }, { status: 400 })

  try {
    const snapshot = SYNC_EVENTS.has(eventType)
      ? await collectMalvoSnapshot({
          itemId,
          expectedBusinessId: context.businessId,
          expectedStoreId: context.storeId,
        })
      : null

    const supabase = await createServerClient()
    const { data, error } = await supabase.rpc('balcao_process_malvo_webhook', {
      p_event_id: payload.eventId,
      p_event_type: eventType,
      p_item_id: itemId,
      p_client_user_id: clientUserId,
      p_triggered_by: typeof payload.triggeredBy === 'string' ? payload.triggeredBy : null,
      p_payload: payload,
      p_snapshot: snapshot,
      p_transaction_ids: Array.isArray(payload.transactionIds) ? payload.transactionIds : [],
      p_error_code: typeof payload.error?.code === 'string' ? payload.error.code : null,
      p_error_message: typeof payload.error?.message === 'string' ? payload.error.message : null,
    })

    if (error) throw error
    const result = data && typeof data === 'object' ? data as Record<string, unknown> : {}
    if (result.ok === false) {
      console.error('BALCAO Malvo webhook RPC requested retry', result.error || 'unknown_error')
      return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate === true,
      ignored: result.ignored === true,
    })
  } catch (caught) {
    console.error('BALCAO Malvo webhook processing failed', caught)
    // A non-2xx response tells Malvo to redeliver the same eventId.
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
