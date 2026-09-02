import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { markMalvoConnectionError, syncMalvoItem } from '@/lib/malvo/sync'
import { parseMalvoClientUserId } from '@/lib/malvo/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

async function deleteRemoteTransactions(itemId: string, clientUserId: unknown, transactionIds: unknown) {
  if (!Array.isArray(transactionIds) || !transactionIds.length) return
  const context = parseMalvoClientUserId(clientUserId)
  if (!context) return
  const admin = createAdminClient()
  const { data: accounts } = await admin.from('balcao_finance_accounts')
    .select('id')
    .eq('business_id', context.businessId)
    .eq('store_id', context.storeId)
    .eq('provider', 'malvo')
  const accountIds = (accounts || []).map((row) => row.id)
  if (!accountIds.length) return
  await admin.from('balcao_finance_transactions')
    .delete()
    .in('account_id', accountIds)
    .in('external_id', transactionIds.map(String))
}

async function markDeleted(itemId: string, clientUserId: unknown) {
  const context = parseMalvoClientUserId(clientUserId)
  if (!context) return
  const admin = createAdminClient()
  await admin.from('balcao_finance_connections')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('provider', 'malvo')
    .eq('provider_item_id', itemId)
  await admin.from('balcao_finance_accounts')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('business_id', context.businessId)
    .eq('store_id', context.storeId)
    .eq('provider', 'malvo')
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await request.json().catch(() => null) as Record<string, any> | null
  if (!payload || typeof payload.event !== 'string' || typeof payload.eventId !== 'string') {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
  }

  const admin = createAdminClient()
  const eventId = payload.eventId
  const eventType = payload.event
  const itemId = typeof payload.itemId === 'string' ? payload.itemId : null

  const { error: insertError } = await admin.from('balcao_finance_webhook_events').insert({
    provider: 'malvo',
    event_id: eventId,
    event_type: eventType,
    provider_item_id: itemId,
    client_user_id: typeof payload.clientUserId === 'string' ? payload.clientUserId : null,
    payload,
  })

  if (insertError?.code === '23505') return NextResponse.json({ ok: true, duplicate: true })
  if (insertError) {
    console.error('BALCAO Malvo webhook journal failed', insertError)
    return NextResponse.json({ error: 'Webhook journal failed' }, { status: 500 })
  }

  try {
    if (eventType === 'transactions/deleted' && itemId) {
      await deleteRemoteTransactions(itemId, payload.clientUserId, payload.transactionIds)
    } else if (eventType === 'item/deleted' && itemId) {
      await markDeleted(itemId, payload.clientUserId)
    } else if (eventType === 'item/error' && itemId) {
      await markMalvoConnectionError({
        itemId,
        clientUserId: payload.clientUserId,
        code: payload.error?.code || null,
        message: payload.error?.message || null,
      })
    } else if (itemId && [
      'item/created',
      'item/updated',
      'transactions/created',
      'transactions/updated',
    ].includes(eventType)) {
      await syncMalvoItem({ itemId, clientUserId: payload.clientUserId })
    }

    await admin.from('balcao_finance_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', eventId)
    return NextResponse.json({ ok: true })
  } catch (caught) {
    console.error('BALCAO Malvo webhook processing failed', caught)
    // Allow Malvo redelivery to retry instead of permanently deduplicating a failed attempt.
    await admin.from('balcao_finance_webhook_events').delete().eq('event_id', eventId)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
