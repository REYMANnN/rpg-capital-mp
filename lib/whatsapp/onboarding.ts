export const WHATSAPP_BUTTONS = {
  createAccount: 'balcao_create_account',
  existingAccount: 'balcao_existing_account',
  consentYes: 'balcao_consent_yes',
  consentNo: 'balcao_consent_no',
} as const

export const WHATSAPP_CONSENT_VERSION = '2026-09-16-v1'
export const WHATSAPP_CONSENT_TEXT = 'Aceito receber mensagens da RPG Capital pelo WhatsApp no número informado, incluindo mensagens relacionadas à minha conta, operação da loja, alertas e atendimento. Posso cancelar esse consentimento a qualquer momento respondendo PARAR.'

export type WhatsAppInbound = {
  messageId: string
  from: string
  kind: 'text' | 'button'
  value: string
}

export function normalizeWhatsAppPhone(input: string): string {
  const digits = String(input ?? '').replace(/\D/g, '')
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) return `55${digits}`
  return digits
}

export function isStopCommand(input: string): boolean {
  return String(input ?? '').trim().toLocaleUpperCase('pt-BR') === 'PARAR'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function parseWhatsAppWebhook(payload: unknown): WhatsAppInbound[] {
  const root = asRecord(payload)
  if (!root || root.object !== 'whatsapp_business_account' || !Array.isArray(root.entry)) return []

  const inbound: WhatsAppInbound[] = []

  for (const entryValue of root.entry) {
    const entry = asRecord(entryValue)
    if (!entry || !Array.isArray(entry.changes)) continue

    for (const changeValue of entry.changes) {
      const change = asRecord(changeValue)
      const value = asRecord(change?.value)
      if (!value || !Array.isArray(value.messages)) continue

      for (const messageValue of value.messages) {
        const message = asRecord(messageValue)
        if (!message || typeof message.id !== 'string' || typeof message.from !== 'string') continue
        const from = normalizeWhatsAppPhone(message.from)
        if (!from) continue

        if (message.type === 'text') {
          const text = asRecord(message.text)
          if (typeof text?.body === 'string') {
            inbound.push({ messageId: message.id, from, kind: 'text', value: text.body })
          }
          continue
        }

        if (message.type === 'interactive') {
          const interactive = asRecord(message.interactive)
          const reply = asRecord(interactive?.button_reply)
          if (interactive?.type === 'button_reply' && typeof reply?.id === 'string') {
            inbound.push({ messageId: message.id, from, kind: 'button', value: reply.id })
          }
          continue
        }

        if (message.type === 'button') {
          const button = asRecord(message.button)
          if (typeof button?.payload === 'string') {
            inbound.push({ messageId: message.id, from, kind: 'button', value: button.payload })
          }
        }
      }
    }
  }

  return inbound
}
