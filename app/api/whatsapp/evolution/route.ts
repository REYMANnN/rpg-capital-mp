import { after } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { applyProviderStatus, recordConnectionState, runOutboxWorker } from '@/lib/whatsapp-evolution'
import { secretMatches } from '@/lib/whatsapp-evolution-auth'
import { evolutionToCloudValue } from '@/lib/whatsapp-evolution-inbound'
import { processValue, safeLogError, type JsonRecord } from '@/lib/whatsapp-inbound'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Webhook da Evolution API (instância "rafa").
// Eventos: MESSAGES_UPSERT, MESSAGES_UPDATE, SEND_MESSAGE, CONNECTION_UPDATE.
// Autenticação: header x-rafa-webhook-secret (configurado no webhook da instância).

function asList(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object')
  return value && typeof value === 'object' ? [value as JsonRecord] : []
}

// true = evento novo; false = já processado (reentrega da Evolution).
async function firstTime(eventKey: string, event: string) {
  const { error } = await createAdminClient().from('wa_webhook_events').insert({ event_key: eventKey, event })
  if (!error) return true
  if ((error as { code?: string }).code === '23505') return false
  throw error
}

async function handle(payload: JsonRecord) {
  const event = String(payload.event || '').toLowerCase().replace(/_/g, '.')

  if (event === 'connection.update') {
    const data = payload.data ?? {}
    const state = typeof data.state === 'string' ? data.state : 'unknown'
    await recordConnectionState(state, typeof data.statusReason === 'number' ? data.statusReason : null)
    if (state === 'open') await runOutboxWorker() // reconectou: drena a fila preservada
    return
  }

  if (event === 'messages.update') {
    for (const update of asList(payload.data)) {
      const id = String(update.keyId ?? update.key?.id ?? '')
      const status = String(update.status ?? '')
      if (!id || !status || !update.fromMe) continue
      if (!(await firstTime(`update:${id}:${status}`, event))) continue
      await applyProviderStatus(id, status)
      await createAdminClient().from('whatsapp_message_status').insert({
        wamid: id,
        status: status.toLowerCase(),
        recipient: typeof update.remoteJid === 'string' ? update.remoteJid.replace(/@.*$/, '') : null,
        status_at: new Date().toISOString(),
        raw: update,
      })
    }
    return
  }

  if (event === 'send.message') {
    // Confirma que a Evolution despachou; o status real chega em messages.update.
    for (const sent of asList(payload.data)) {
      const id = String(sent.key?.id ?? '')
      const status = String(sent.status ?? '')
      if (id && status) await applyProviderStatus(id, status)
    }
    return
  }

  if (event === 'messages.upsert') {
    for (const item of asList(payload.data)) {
      const id = String(item.key?.id ?? '')
      if (!id || item.key?.fromMe) continue
      if (!(await firstTime(`upsert:${id}`, event))) continue
      const converted = await evolutionToCloudValue(item)
      if (!converted.value) continue
      await processValue(converted.value)
    }
  }
}

export async function POST(req: Request) {
  if (!secretMatches(req.headers.get('x-rafa-webhook-secret'), 'EVOLUTION_WEBHOOK_SECRET')) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: JsonRecord
  try {
    payload = await req.json() as JsonRecord
  } catch {
    return new Response('OK', { status: 200 })
  }

  // Responde rápido; processa depois (a Evolution tem timeout e faz retry).
  after(async () => {
    try { await handle(payload) } catch (error) { safeLogError(error, 'evolution_webhook') }
  })
  return new Response('OK', { status: 200 })
}
