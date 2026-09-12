import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.105.3'

const RETRY_SECONDS = [30, 120, 600, 3600, 21600] as const
const PAUSE_AFTER_FAILURES = 20
const EVENT_API_VERSION = '2026-09-12'

type Json = Record<string, unknown>

type OutboxEvent = {
  id: string
  business_id: string
  store_id: string | null
  event_type: string
  aggregate_type: string | null
  aggregate_id: string | null
  data: Json
  occurred_at: string
}

type WebhookEndpoint = {
  id: string
  business_id: string
  store_id: string | null
  url: string
  secret_ciphertext: string
  status: string
  consecutive_failures: number
}

function json(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

function base64urlBytes(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(base64)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function decryptSecret(ciphertext: string, masterSecret: string) {
  const [version, ivText, tagText, dataText] = ciphertext.split('.')
  if (version !== 'v1' || !ivText || !tagText || !dataText) throw new Error('invalid_webhook_secret')

  const masterDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(masterSecret))
  const key = await crypto.subtle.importKey('raw', masterDigest, { name: 'AES-GCM' }, false, ['decrypt'])
  const encrypted = base64urlBytes(dataText)
  const tag = base64urlBytes(tagText)
  const combined = new Uint8Array(encrypted.length + tag.length)
  combined.set(encrypted)
  combined.set(tag, encrypted.length)

  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64urlBytes(ivText), tagLength: 128 },
    key,
    combined,
  )
  return new TextDecoder().decode(clear)
}

async function sign(secret: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`))
  return `v1=${bytesToHex(new Uint8Array(signature))}`
}

function nextRetry(attempt: number) {
  const seconds = RETRY_SECONDS[Math.min(Math.max(0, attempt - 1), RETRY_SECONDS.length - 1)]
  return new Date(Date.now() + seconds * 1000).toISOString()
}

async function materializeDeliveries(supabase: ReturnType<typeof createClient>) {
  const { data: events, error } = await supabase
    .from('balcao_event_outbox')
    .select('id,business_id,store_id,event_type,aggregate_type,aggregate_id,data,occurred_at')
    .is('published_at', null)
    .order('created_at', { ascending: true })
    .limit(50)
  if (error) throw error

  let materialized = 0
  for (const event of (events ?? []) as OutboxEvent[]) {
    const { data: candidates, error: endpointError } = await supabase
      .from('balcao_webhook_endpoints')
      .select('id,store_id')
      .eq('business_id', event.business_id)
      .eq('status', 'active')
      .contains('event_types', [event.event_type])
    if (endpointError) throw endpointError

    const endpoints = (candidates ?? []).filter((endpoint: any) =>
      endpoint.store_id == null || event.store_id == null || String(endpoint.store_id) === String(event.store_id)
    )
    if (endpoints.length) {
      const now = new Date().toISOString()
      const rows = endpoints.map((endpoint: any) => ({
        endpoint_id: endpoint.id,
        event_id: event.id,
        status: 'pending',
        attempt_count: 0,
        next_retry_at: now,
      }))
      const { error: deliveryError } = await supabase
        .from('balcao_webhook_deliveries')
        .upsert(rows, { onConflict: 'endpoint_id,event_id', ignoreDuplicates: true })
      if (deliveryError) throw deliveryError
      materialized += rows.length
    }

    const { error: publishedError } = await supabase
      .from('balcao_event_outbox')
      .update({ published_at: new Date().toISOString() })
      .eq('id', event.id)
      .is('published_at', null)
    if (publishedError) throw publishedError
  }
  return materialized
}

async function updateEndpointFailure(supabase: ReturnType<typeof createClient>, endpoint: WebhookEndpoint) {
  const failures = Number(endpoint.consecutive_failures ?? 0) + 1
  const paused = failures >= PAUSE_AFTER_FAILURES
  const { error } = await supabase
    .from('balcao_webhook_endpoints')
    .update({
      consecutive_failures: failures,
      last_failure_at: new Date().toISOString(),
      ...(paused ? { status: 'paused' } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', endpoint.id)
  if (error) throw error
  return { failures, paused }
}

async function deliverDue(supabase: ReturnType<typeof createClient>, masterSecret: string) {
  const now = new Date().toISOString()
  const { data: deliveries, error } = await supabase
    .from('balcao_webhook_deliveries')
    .select('id,endpoint_id,event_id,status,attempt_count')
    .in('status', ['pending', 'retrying'])
    .lte('next_retry_at', now)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) throw error

  let delivered = 0
  let failed = 0
  let retrying = 0

  for (const delivery of deliveries ?? []) {
    const [{ data: endpoint, error: endpointError }, { data: event, error: eventError }] = await Promise.all([
      supabase.from('balcao_webhook_endpoints')
        .select('id,business_id,store_id,url,secret_ciphertext,status,consecutive_failures')
        .eq('id', delivery.endpoint_id).maybeSingle(),
      supabase.from('balcao_event_outbox')
        .select('id,business_id,store_id,event_type,aggregate_type,aggregate_id,data,occurred_at')
        .eq('id', delivery.event_id).maybeSingle(),
    ])
    if (endpointError) throw endpointError
    if (eventError) throw eventError

    if (!endpoint || endpoint.status !== 'active' || !event) {
      await supabase.from('balcao_webhook_deliveries').update({
        status: 'failed',
        last_error: !endpoint ? 'endpoint_not_found' : endpoint.status !== 'active' ? 'endpoint_not_active' : 'event_not_found',
        next_retry_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', delivery.id)
      failed += 1
      continue
    }

    const typedEndpoint = endpoint as WebhookEndpoint
    const typedEvent = event as OutboxEvent
    const eventId = `evt_${typedEvent.id.replace(/-/g, '')}`
    const payload = {
      id: eventId,
      type: typedEvent.event_type,
      apiVersion: EVENT_API_VERSION,
      occurredAt: typedEvent.occurred_at,
      businessId: typedEvent.business_id,
      storeId: typedEvent.store_id,
      data: typedEvent.data ?? {},
    }
    const body = JSON.stringify(payload)
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const attempt = Number(delivery.attempt_count ?? 0) + 1
    const started = performance.now()

    try {
      const secret = await decryptSecret(typedEndpoint.secret_ciphertext, masterSecret)
      const signature = await sign(secret, timestamp, body)
      const response = await fetch(typedEndpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'BALCAO-Webhooks/1.0',
          'X-RPG-Event-Id': eventId,
          'X-RPG-Timestamp': timestamp,
          'X-RPG-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      })
      const durationMs = Math.max(0, Math.round(performance.now() - started))

      if (response.ok) {
        const completedAt = new Date().toISOString()
        const [{ error: deliveryError }, { error: endpointUpdateError }] = await Promise.all([
          supabase.from('balcao_webhook_deliveries').update({
            status: 'delivered',
            attempt_count: attempt,
            response_status: response.status,
            duration_ms: durationMs,
            last_error: null,
            next_retry_at: null,
            delivered_at: completedAt,
            updated_at: completedAt,
          }).eq('id', delivery.id),
          supabase.from('balcao_webhook_endpoints').update({
            consecutive_failures: 0,
            last_success_at: completedAt,
            updated_at: completedAt,
          }).eq('id', typedEndpoint.id),
        ])
        if (deliveryError) throw deliveryError
        if (endpointUpdateError) throw endpointUpdateError
        delivered += 1
        continue
      }

      const shouldRetry = attempt <= RETRY_SECONDS.length
      await supabase.from('balcao_webhook_deliveries').update({
        status: shouldRetry ? 'retrying' : 'failed',
        attempt_count: attempt,
        response_status: response.status,
        duration_ms: durationMs,
        last_error: `http_${response.status}`,
        next_retry_at: shouldRetry ? nextRetry(attempt) : null,
        updated_at: new Date().toISOString(),
      }).eq('id', delivery.id)
      await updateEndpointFailure(supabase, typedEndpoint)
      if (shouldRetry) retrying += 1
      else failed += 1
    } catch (caught) {
      const durationMs = Math.max(0, Math.round(performance.now() - started))
      const shouldRetry = attempt <= RETRY_SECONDS.length
      const message = caught instanceof Error ? caught.message.slice(0, 240) : 'delivery_failed'
      await supabase.from('balcao_webhook_deliveries').update({
        status: shouldRetry ? 'retrying' : 'failed',
        attempt_count: attempt,
        duration_ms: durationMs,
        last_error: message,
        next_retry_at: shouldRetry ? nextRetry(attempt) : null,
        updated_at: new Date().toISOString(),
      }).eq('id', delivery.id)
      await updateEndpointFailure(supabase, typedEndpoint)
      if (shouldRetry) retrying += 1
      else failed += 1
    }
  }

  return { delivered, failed, retrying }
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const dispatchSecret = Deno.env.get('BALCAO_WEBHOOK_DISPATCH_SECRET')?.trim()
  const providedSecret = request.headers.get('x-balcao-dispatch-secret')?.trim()
  if (!dispatchSecret || !providedSecret || providedSecret !== dispatchSecret) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  const masterSecret = Deno.env.get('BALCAO_WEBHOOK_MASTER_KEY')?.trim()
  if (!supabaseUrl || !serviceRoleKey || !masterSecret) {
    console.error('BALCAO webhook dispatcher missing runtime credentials')
    return json({ error: 'Server configuration error' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const materialized = await materializeDeliveries(supabase)
    const delivery = await deliverDue(supabase, masterSecret)
    return json({ ok: true, materialized, ...delivery })
  } catch (error) {
    console.error('BALCAO webhook dispatcher failed', error)
    return json({ error: 'Dispatcher failed' }, 500)
  }
})
