/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only'

import { createHash } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'

// Evolution API (Baileys) como gateway de WhatsApp.
// Regra de ouro: HTTP 200/201 da Evolution só significa "aceito pelo gateway".
// Entrega real = status SERVER_ACK/DELIVERY_ACK/READ vindo de MESSAGES_UPDATE.

export type EvoResult = { ok: true; data?: unknown } | { ok: false; error: string }

export type EvoButton = { id: string; title: string }

export type OutboxKind = 'text' | 'buttons' | 'menu_fallback'

type OutboxRow = {
  id: string
  idempotency_key: string
  instance: string
  to_phone: string
  kind: OutboxKind
  payload: Record<string, any>
  status: string
  provider_message_id: string | null
  attempts: number
  max_attempts: number
  in_reply_to: string | null
  sent_at: string | null
  created_at: string
}

// Menu principal da Rafa. Mantido aqui (e não importado de whatsapp-menu) para evitar import circular.
export const RAFA_MAIN_MENU: EvoButton[] = [
  { id: 'vender', title: 'Vender' },
  { id: 'ler_codigo', title: 'Ler código' },
  { id: 'prateleira', title: 'Prateleira' },
]

function stripSignature(body: string) {
  return body.replace(/\s*\n?\s*[—–-]\s*Rafa\s*$/u, '').trim()
}

const ACK_TIMEOUT_MS = 60_000
const BUTTON_ATTEMPTS_BEFORE_FALLBACK = 2

function env(name: 'EVOLUTION_API_URL' | 'EVOLUTION_API_KEY') {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export function evolutionInstance() {
  return process.env.EVOLUTION_INSTANCE?.trim() || 'rafa'
}

export function isEvolutionProvider() {
  return process.env.WHATSAPP_PROVIDER?.trim().toLowerCase() === 'evolution'
}

export function normalizePhone(value: string) {
  return value.replace(/@.*$/, '').replace(/:.*$/, '').replace(/\D/g, '')
}

async function evoRequest(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const base = env('EVOLUTION_API_URL').replace(/\/+$/, '')
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { apikey: env('EVOLUTION_API_KEY'), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    const data = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, data }
  } catch (error) {
    return { ok: false, status: 0, data: { message: error instanceof Error ? error.message : 'request_failed' } }
  }
}

function errorText(data: any, status: number) {
  const message = data?.response?.message ?? data?.message ?? data?.error
  const text = Array.isArray(message) ? message.join('; ') : typeof message === 'string' ? message : JSON.stringify(message ?? null)
  return `Evolution HTTP ${status}: ${String(text).slice(0, 300)}`
}

// ---------- Estado da conexão ----------

export async function liveConnectionState(): Promise<string> {
  const result = await evoRequest('GET', `/instance/connectionState/${encodeURIComponent(evolutionInstance())}`)
  const state = result.data?.instance?.state ?? result.data?.state
  return typeof state === 'string' ? state : 'unknown'
}

export async function recordConnectionState(state: string, statusReason?: number | null) {
  const admin = createAdminClient()
  await admin.from('wa_instance_state').upsert({
    instance: evolutionInstance(),
    state,
    status_reason: statusReason ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'instance' })
}

async function isConnected(): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin.from('wa_instance_state').select('state,updated_at').eq('instance', evolutionInstance()).maybeSingle()
  // Estado recente registrado via CONNECTION_UPDATE vale; senão, pergunta pra Evolution.
  if (data?.state && Date.now() - new Date(data.updated_at).getTime() < 5 * 60_000) return data.state === 'open'
  const live = await liveConnectionState()
  if (live !== 'unknown') await recordConnectionState(live)
  return live === 'open'
}

// ---------- Envio cru ----------

function fallbackText(payload: Record<string, any>) {
  const buttons: EvoButton[] = Array.isArray(payload.buttons) ? payload.buttons : []
  const options = buttons.map((button, index) => `${index + 1} - ${button.title}`).join('\n')
  return `${payload.body}\n\n${options}\n\nResponda com o número da opção.`
}

async function rawSend(row: Pick<OutboxRow, 'kind' | 'payload' | 'to_phone'>): Promise<{ ok: true; providerId: string | null } | { ok: false; error: string }> {
  const instance = encodeURIComponent(evolutionInstance())
  let result: Awaited<ReturnType<typeof evoRequest>>

  if (row.kind === 'buttons') {
    const buttons: EvoButton[] = row.payload.buttons ?? []
    result = await evoRequest('POST', `/message/sendButtons/${instance}`, {
      number: row.to_phone,
      title: 'Rafa',
      description: row.payload.body,
      footer: row.payload.footer || undefined,
      buttons: buttons.map((button) => ({ type: 'reply', displayText: button.title, id: button.id })),
    })
  } else {
    const text = row.kind === 'menu_fallback' ? fallbackText(row.payload) : String(row.payload.body ?? '')
    result = await evoRequest('POST', `/message/sendText/${instance}`, { number: row.to_phone, text })
  }

  if (!result.ok) return { ok: false, error: errorText(result.data, result.status) }
  const providerId = typeof result.data?.key?.id === 'string' ? result.data.key.id : null
  return { ok: true, providerId }
}

// ---------- Outbox ----------

function idempotencyKeyFor(input: { to: string; kind: OutboxKind; payload: unknown; inReplyTo?: string | null; key?: string }) {
  if (input.key) return input.key
  // Com inReplyTo: reentrega do mesmo webhook não duplica a resposta.
  // Sem inReplyTo: janela de 1 minuto evita disparo duplo acidental.
  const scope = input.inReplyTo ? `reply:${input.inReplyTo}` : `minute:${Math.floor(Date.now() / 60_000)}`
  return createHash('sha256')
    .update(`${input.to}|${input.kind}|${scope}|${JSON.stringify(input.payload)}`)
    .digest('hex')
}

async function dispatch(row: OutboxRow): Promise<EvoResult> {
  const admin = createAdminClient()
  const attempts = row.attempts + 1
  const sent = await rawSend(row)
  const now = new Date().toISOString()

  if (sent.ok) {
    await admin.from('wa_outbox').update({
      status: 'sent',
      provider_message_id: sent.providerId,
      attempts,
      sent_at: now,
      last_error: null,
      updated_at: now,
    }).eq('id', row.id)
    return { ok: true, data: { outboxId: row.id, providerMessageId: sent.providerId } }
  }

  const exhausted = attempts >= row.max_attempts
  const backoffMs = Math.min(5 * 60_000, 15_000 * 2 ** (attempts - 1))
  await admin.from('wa_outbox').update({
    status: exhausted ? 'failed' : 'queued',
    attempts,
    last_error: sent.error,
    next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
    updated_at: now,
  }).eq('id', row.id)
  return { ok: false, error: sent.error }
}

export async function enqueueWhatsApp(input: {
  to: string
  kind: OutboxKind
  payload: Record<string, unknown>
  inReplyTo?: string | null
  idempotencyKey?: string
  noMenu?: boolean
}): Promise<EvoResult> {
  const to = normalizePhone(input.to)
  if (!to) return { ok: false, error: 'Invalid WhatsApp recipient' }
  // Botões via Baileys recebem DELIVERY_ACK mas não aparecem em vários clientes
  // (testado: iPhone). Por padrão o menu vai em texto numerado; EVOLUTION_BUTTONS=on reativa.
  if (input.kind === 'buttons' && process.env.EVOLUTION_BUTTONS !== 'on') {
    input = { ...input, kind: 'menu_fallback' }
  }
  // Sem assinatura "— Rafa" no fim das mensagens.
  if (typeof input.payload.body === 'string') {
    input = { ...input, payload: { ...input.payload, body: stripSignature(input.payload.body) } }
  }

  // Toda resposta em texto é seguida por uma mensagem separada com o menu principal: o lojista
  // nunca fica sem próximo passo e responder 1/2/3 funciona a qualquer momento, sem prazo.
  // noMenu=true para mensagens que aguardam resposta (pergunta aberta ou confirmação Sim/Não).
  if (input.kind === 'text' && !input.noMenu && process.env.EVOLUTION_AUTO_MENU !== 'off') {
    const sent = await enqueueWhatsApp({ ...input, noMenu: true })
    if (!sent.ok) return sent
    await enqueueWhatsApp({
      to: input.to,
      kind: 'menu_fallback',
      payload: { body: 'O que você quer fazer agora?', buttons: RAFA_MAIN_MENU },
      inReplyTo: input.inReplyTo,
      noMenu: true,
    })
    return sent
  }

  const admin = createAdminClient()
  const idempotency_key = idempotencyKeyFor({ to, kind: input.kind, payload: input.payload, inReplyTo: input.inReplyTo, key: input.idempotencyKey })

  const { data: inserted, error } = await admin.from('wa_outbox').insert({
    idempotency_key,
    instance: evolutionInstance(),
    to_phone: to,
    kind: input.kind,
    payload: input.payload,
    in_reply_to: input.inReplyTo ?? null,
  }).select('*').maybeSingle()

  if (error) {
    // 23505 = unique_violation → mensagem idêntica já registrada: não envia de novo.
    if ((error as { code?: string }).code === '23505') return { ok: true, data: { duplicate: true } }
    return { ok: false, error: `outbox_insert_failed: ${error.message}` }
  }
  if (!inserted) return { ok: false, error: 'outbox_insert_failed' }

  // Sessão caída → fica na fila; o worker envia quando reconectar.
  if (!(await isConnected())) return { ok: true, data: { outboxId: inserted.id, queued: true } }

  const { data: claimed } = await admin.from('wa_outbox')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', inserted.id)
    .eq('status', 'queued')
    .select('*')
    .maybeSingle()
  if (!claimed) return { ok: true, data: { outboxId: inserted.id, queued: true } }

  const result = await dispatch(claimed as OutboxRow)
  // Falha de envio não se perde: a linha volta pra fila com backoff.
  return result.ok ? result : { ok: true, data: { outboxId: inserted.id, queued: true, lastError: result.error } }
}

// ---------- Status vindo do webhook ----------

const STATUS_MAP: Record<string, string> = {
  ERROR: 'failed',
  PENDING: 'pending',
  SERVER_ACK: 'server_ack',
  DELIVERY_ACK: 'delivered',
  READ: 'read',
  PLAYED: 'read',
}

const STATUS_RANK: Record<string, number> = {
  queued: 0, sending: 1, sent: 2, pending: 3, server_ack: 4, delivered: 5, read: 6,
}

export async function applyProviderStatus(providerMessageId: string, providerStatus: string) {
  const next = STATUS_MAP[providerStatus]
  if (!next || !providerMessageId) return
  const admin = createAdminClient()
  const { data: row } = await admin.from('wa_outbox')
    .select('id,status,acked_at')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle()
  if (!row) return

  if (next === 'failed') {
    // Erro do WhatsApp: volta pra fila para o worker decidir retry/fallback.
    await admin.from('wa_outbox').update({ status: 'queued', last_error: 'provider_status_error', updated_at: new Date().toISOString() }).eq('id', row.id)
    return
  }
  if ((STATUS_RANK[next] ?? 0) <= (STATUS_RANK[row.status] ?? -1)) return

  const now = new Date().toISOString()
  await admin.from('wa_outbox').update({
    status: next,
    acked_at: next === 'pending' ? row.acked_at : (row.acked_at ?? now),
    updated_at: now,
  }).eq('id', row.id)
}

// ---------- Worker: retry, fallback e dreno da fila ----------

export async function runOutboxWorker(): Promise<Record<string, number | string>> {
  const admin = createAdminClient()
  const report: Record<string, number | string> = { requeued: 0, fallback: 0, failed: 0, dispatched: 0 }

  const state = await liveConnectionState()
  await recordConnectionState(state)
  report.state = state
  if (state !== 'open') return report // sessão caída: preserva a fila, não envia

  // 1) Mensagens "enviadas" sem ACK do servidor do WhatsApp dentro do prazo.
  const cutoff = new Date(Date.now() - ACK_TIMEOUT_MS).toISOString()
  const { data: stuck } = await admin.from('wa_outbox')
    .select('*')
    .in('status', ['sent', 'pending'])
    .lt('sent_at', cutoff)
    .limit(50)

  for (const row of (stuck ?? []) as OutboxRow[]) {
    const now = new Date().toISOString()
    if (row.kind === 'buttons' && row.attempts >= BUTTON_ATTEMPTS_BEFORE_FALLBACK) {
      await admin.from('wa_outbox').update({
        kind: 'menu_fallback', status: 'queued', attempts: 0, next_attempt_at: now,
        last_error: 'buttons_not_acked_fallback_to_text', updated_at: now,
      }).eq('id', row.id).in('status', ['sent', 'pending'])
      report.fallback = Number(report.fallback) + 1
    } else if (row.attempts >= row.max_attempts) {
      await admin.from('wa_outbox').update({ status: 'failed', last_error: 'no_ack_after_max_attempts', updated_at: now })
        .eq('id', row.id).in('status', ['sent', 'pending'])
      report.failed = Number(report.failed) + 1
    } else {
      await admin.from('wa_outbox').update({ status: 'queued', next_attempt_at: now, last_error: 'no_ack_timeout', updated_at: now })
        .eq('id', row.id).in('status', ['sent', 'pending'])
      report.requeued = Number(report.requeued) + 1
    }
  }

  // Botão que falhou de vez no envio HTTP também cai pro texto.
  await admin.from('wa_outbox').update({
    kind: 'menu_fallback', status: 'queued', attempts: 0, next_attempt_at: new Date().toISOString(),
    last_error: 'buttons_failed_fallback_to_text', updated_at: new Date().toISOString(),
  }).eq('kind', 'buttons').eq('status', 'failed')

  // 2) Drena a fila (claim atômico).
  const { data: claimed } = await admin.rpc('wa_outbox_claim', { p_limit: 20 })
  for (const row of (claimed ?? []) as OutboxRow[]) {
    await dispatch(row)
    report.dispatched = Number(report.dispatched) + 1
  }

  // 3) Limpeza de dedupe de webhook (>7 dias).
  await admin.from('wa_webhook_events').delete().lt('received_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
  return report
}

// ---------- Leitura / mídia ----------

export async function evoMarkAsRead(messageId: string, phone: string): Promise<EvoResult> {
  const result = await evoRequest('POST', `/chat/markMessageAsRead/${encodeURIComponent(evolutionInstance())}`, {
    readMessages: [{ remoteJid: `${normalizePhone(phone)}@s.whatsapp.net`, fromMe: false, id: messageId }],
  })
  return result.ok ? { ok: true } : { ok: false, error: errorText(result.data, result.status) }
}

export async function evoDownloadMedia(messageId: string): Promise<{ bytes: Uint8Array; mime: string; fileName: string | null }> {
  const result = await evoRequest('POST', `/chat/getBase64FromMediaMessage/${encodeURIComponent(evolutionInstance())}`, {
    message: { key: { id: messageId } },
    convertToMp4: false,
  })
  if (!result.ok || typeof result.data?.base64 !== 'string') throw new Error(errorText(result.data, result.status))
  return {
    bytes: new Uint8Array(Buffer.from(result.data.base64, 'base64')),
    mime: String(result.data.mimetype || 'application/octet-stream').split(';')[0],
    fileName: typeof result.data.fileName === 'string' ? result.data.fileName : null,
  }
}

// Última mensagem enviada ao contato foi o menu em texto? (para interpretar "1/2/3")
export async function lastOutboundWasTextMenu(phone: string): Promise<EvoButton[] | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('wa_outbox')
    .select('kind,payload,created_at')
    .eq('to_phone', normalizePhone(phone))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  // Sem prazo: vale o menu se ele foi a última mensagem da Rafa, mesmo dias depois.
  // Se a última mensagem foi uma pergunta aberta (sem menu), o número vai como texto para a Rafa.
  if (!data || data.kind !== 'menu_fallback') return null
  return Array.isArray(data.payload?.buttons) ? data.payload.buttons as EvoButton[] : null
}
