export const WHATSAPP_BUTTON_IDS = {
  createAccount: 'balcao_create_account',
  existingAccount: 'balcao_existing_account',
  consentYes: 'balcao_consent_yes',
  consentNo: 'balcao_consent_no',
} as const

type ParsedInbound = {
  messageId: string
  waId: string
  text: string
  buttonId: string
  buttonTitle: string
  type: string
}

export function normalizeWaId(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : ''
}

function normalizeCommand(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

export function isStopCommand(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return ['PARAR', 'STOP', 'CANCELAR', 'SAIR'].includes(normalizeCommand(value))
}

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : []
}

export function parseInboundWhatsAppMessages(payload: unknown): ParsedInbound[] {
  if (!payload || typeof payload !== 'object') return []
  const output: ParsedInbound[] = []

  for (const entry of array((payload as any).entry)) {
    for (const change of array(entry?.changes)) {
      const value = change?.value
      const contacts = array(value?.contacts)
      const contactWaId = normalizeWaId(contacts[0]?.wa_id)

      for (const message of array(value?.messages)) {
        const messageId = typeof message?.id === 'string' ? message.id : ''
        const waId = normalizeWaId(message?.from) || contactWaId
        if (!messageId || !waId) continue

        const type = typeof message?.type === 'string' ? message.type : ''
        const text = type === 'text' && typeof message?.text?.body === 'string'
          ? message.text.body.trim()
          : ''
        const buttonReply = type === 'interactive' && message?.interactive?.type === 'button_reply'
          ? message.interactive.button_reply
          : null
        const buttonId = typeof buttonReply?.id === 'string' ? buttonReply.id : ''
        const buttonTitle = typeof buttonReply?.title === 'string' ? buttonReply.title : ''

        output.push({ messageId, waId, text, buttonId, buttonTitle, type })
      }
    }
  }

  return output
}
