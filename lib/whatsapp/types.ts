export type WhatsAppContactState =
  | 'awaiting_entry_choice'
  | 'awaiting_business_name'
  | 'awaiting_consent'
  | 'awaiting_link'
  | 'active'

export type InboundWhatsAppMessage = {
  messageId: string
  waId: string
  text: string
  buttonId: string
  buttonTitle: string
  type: string
}

export type WhatsAppReplyButton = {
  id: string
  title: string
}

export type WhatsAppContactRecord = {
  wa_id: string
  phone_e164: string
  business_id: string | null
  user_id: string | null
  state: WhatsAppContactState
  pending_business_name: string | null
  consent_current: boolean
  consent_version: string | null
  consent_updated_at: string | null
}
