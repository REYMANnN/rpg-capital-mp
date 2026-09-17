import type { WhatsAppReplyButton } from '@/lib/whatsapp/types'

function config() {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN?.trim()
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim()
  const graphVersion = process.env.META_WHATSAPP_GRAPH_VERSION?.trim() || 'v24.0'

  if (!accessToken) throw new Error('META_WHATSAPP_ACCESS_TOKEN is not configured')
  if (!phoneNumberId) throw new Error('META_WHATSAPP_PHONE_NUMBER_ID is not configured')

  return { accessToken, phoneNumberId, graphVersion }
}

async function sendMessage(to: string, payload: Record<string, unknown>) {
  const { accessToken, phoneNumberId, graphVersion } = config()
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      ...payload,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })

  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const error = new Error(`WhatsApp Cloud API request failed (${response.status})`)
    ;(error as Error & { details?: unknown }).details = body
    throw error
  }
  return body
}

export async function sendWhatsAppText(to: string, text: string) {
  return sendMessage(to, {
    type: 'text',
    text: { preview_url: false, body: text },
  })
}

export async function sendWhatsAppButtons(to: string, body: string, buttons: WhatsAppReplyButton[]) {
  if (buttons.length < 1 || buttons.length > 3) throw new Error('WhatsApp reply buttons must contain 1 to 3 items')
  return sendMessage(to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.map((button) => ({
          type: 'reply',
          reply: { id: button.id, title: button.title },
        })),
      },
    },
  })
}
