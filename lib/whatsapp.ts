import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

const GRAPH_API_VERSION = 'v23.0'

export type WhatsAppResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: string }

export type WhatsAppReplyButton = {
  id: string
  title: string
}

type SendOptions = {
  inReplyTo?: string
}

function normalizeRecipient(value: string) {
  return value.replace(/\D/g, '')
}

function requiredEnv(name: 'WHATSAPP_TOKEN' | 'WHATSAPP_PHONE_NUMBER_ID') {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function graphPost(payload: Record<string, unknown>): Promise<WhatsAppResult> {
  try {
    const phoneNumberId = requiredEnv('WHATSAPP_PHONE_NUMBER_ID')
    const token = requiredEnv('WHATSAPP_TOKEN')
    const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })

    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const message = data && typeof data === 'object' && 'error' in data
        ? String((data as { error?: { message?: string } }).error?.message || `Meta API HTTP ${response.status}`)
        : `Meta API HTTP ${response.status}`
      return { ok: false, error: message }
    }

    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'WhatsApp request failed' }
  }
}

async function validateOutboundRecipient(recipient: string, options?: SendOptions): Promise<WhatsAppResult | null> {
  // Immediate replies are allowed only from the signature-validated webhook.
  // All proactive sends retain the existing fail-closed opt-out check.
  if (options?.inReplyTo) return null

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('whatsapp_contacts')
      .select('opted_out')
      .eq('wa_id', recipient)
      .maybeSingle()

    if (error) return { ok: false, error: 'Unable to validate WhatsApp contact state' }
    if (data?.opted_out === true) return { ok: false, error: 'WhatsApp contact opted out' }
    return null
  } catch {
    return { ok: false, error: 'Unable to validate WhatsApp contact state' }
  }
}

export async function sendText(to: string, body: string, options?: SendOptions): Promise<WhatsAppResult> {
  const recipient = normalizeRecipient(to)
  if (!recipient) return { ok: false, error: 'Invalid WhatsApp recipient' }

  const blocked = await validateOutboundRecipient(recipient, options)
  if (blocked) return blocked

  return graphPost({
    ...(options?.inReplyTo ? { context: { message_id: options.inReplyTo } } : {}),
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'text',
    text: { body, preview_url: false },
  })
}

export async function sendReplyButtons(
  to: string,
  body: string,
  footer: string,
  buttons: WhatsAppReplyButton[],
  options?: SendOptions,
): Promise<WhatsAppResult> {
  const recipient = normalizeRecipient(to)
  if (!recipient) return { ok: false, error: 'Invalid WhatsApp recipient' }
  if (buttons.length !== 3) return { ok: false, error: 'WhatsApp menu requires exactly 3 buttons' }

  const blocked = await validateOutboundRecipient(recipient, options)
  if (blocked) return blocked

  return graphPost({
    ...(options?.inReplyTo ? { context: { message_id: options.inReplyTo } } : {}),
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      footer: { text: footer },
      action: {
        buttons: buttons.map((button) => ({
          type: 'reply',
          reply: { id: button.id, title: button.title },
        })),
      },
    },
  })
}

export async function markAsRead(wamid: string): Promise<WhatsAppResult> {
  if (!wamid.trim()) return { ok: false, error: 'Invalid WhatsApp message id' }

  return graphPost({
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: wamid,
  })
}

