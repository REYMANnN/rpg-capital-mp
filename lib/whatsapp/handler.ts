import { createHash, randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  WHATSAPP_CONSENT_QUESTION,
  WHATSAPP_CONSENT_TEXT,
  WHATSAPP_CONSENT_VERSION,
  WHATSAPP_STOP_CONFIRMATION,
} from '@/lib/legal/whatsappConsent'
import { sendWhatsAppButtons, sendWhatsAppText } from '@/lib/whatsapp/cloud'
import { isStopCommand, parseInboundWhatsAppMessages, WHATSAPP_BUTTON_IDS } from '@/lib/whatsapp/inbound'
import type { InboundWhatsAppMessage, WhatsAppContactRecord } from '@/lib/whatsapp/types'

const ENTRY_TEXT = 'Olá! Sou a RPG Capital 👋\nOrganizo estoque, vendas e lucro da sua loja aqui no WhatsApp.'
const READY_TEXT = 'Pronto ✅ Sua loja está vinculada ao BALCÃO. Você já pode continuar falando com a RPG Capital por aqui.'

const ENTRY_BUTTONS = [
  { id: WHATSAPP_BUTTON_IDS.createAccount, title: 'Criar minha conta' },
  { id: WHATSAPP_BUTTON_IDS.existingAccount, title: 'Já tenho conta' },
]

const CONSENT_BUTTONS = [
  { id: WHATSAPP_BUTTON_IDS.consentYes, title: 'Sim, pode mandar' },
  { id: WHATSAPP_BUTTON_IDS.consentNo, title: 'Agora não' },
]

function phoneE164(waId: string) {
  return `+${waId}`
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://www.rpgcapital.com.br').replace(/\/$/, '')
}

async function getContact(waId: string): Promise<WhatsAppContactRecord | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('balcao_whatsapp_contacts')
    .select('wa_id,phone_e164,business_id,user_id,state,pending_business_name,consent_current,consent_version,consent_updated_at')
    .eq('wa_id', waId)
    .maybeSingle()
  if (error) throw error
  return data as WhatsAppContactRecord | null
}

async function ensureContact(waId: string): Promise<WhatsAppContactRecord> {
  const existing = await getContact(waId)
  if (existing) return existing

  const admin = createAdminClient()
  const { error } = await admin.from('balcao_whatsapp_contacts').insert({
    wa_id: waId,
    phone_e164: phoneE164(waId),
    state: 'awaiting_entry_choice',
  })
  if (error && error.code !== '23505') throw error
  const created = await getContact(waId)
  if (!created) throw new Error('WhatsApp contact could not be created')
  return created
}

async function updateContact(waId: string, patch: Record<string, unknown>) {
  const admin = createAdminClient()
  const { error } = await admin.from('balcao_whatsapp_contacts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('wa_id', waId)
  if (error) throw error
}

async function claimMessage(message: InboundWhatsAppMessage) {
  const admin = createAdminClient()
  const { data: existing, error: readError } = await admin
    .from('balcao_whatsapp_webhook_events')
    .select('processed_at,error')
    .eq('message_id', message.messageId)
    .maybeSingle()
  if (readError) throw readError
  if (existing?.processed_at) return false

  if (existing) {
    if (!existing.error) return false
    const { error } = await admin.from('balcao_whatsapp_webhook_events')
      .update({ error: null, received_at: new Date().toISOString() })
      .eq('message_id', message.messageId)
      .is('processed_at', null)
    if (error) throw error
    return true
  }

  const { error } = await admin.from('balcao_whatsapp_webhook_events').insert({
    message_id: message.messageId,
    wa_id: message.waId,
  })
  if (error?.code === '23505') return false
  if (error) throw error
  return true
}

async function finishMessage(messageId: string, errorMessage?: string) {
  const admin = createAdminClient()
  const patch = errorMessage
    ? { error: errorMessage.slice(0, 500) }
    : { processed_at: new Date().toISOString(), error: null }
  const { error } = await admin.from('balcao_whatsapp_webhook_events')
    .update(patch)
    .eq('message_id', messageId)
  if (error) console.error('BALCAO WhatsApp webhook event update failed', { code: error.code })
}

async function recordGrant(contact: WhatsAppContactRecord, messageId: string) {
  if (!contact.business_id) throw new Error('Cannot grant WhatsApp consent without a business')
  const admin = createAdminClient()
  const { error } = await admin.from('balcao_whatsapp_consents').insert({
    business_id: contact.business_id,
    user_id: contact.user_id,
    wa_id: contact.wa_id,
    phone_e164: contact.phone_e164,
    status: 'granted',
    consent_text: WHATSAPP_CONSENT_TEXT,
    policy_version: WHATSAPP_CONSENT_VERSION,
    source: 'whatsapp_reoptin',
    source_message_id: messageId,
  })
  if (error && error.code !== '23505') throw error
  await updateContact(contact.wa_id, {
    state: 'active',
    consent_current: true,
    consent_version: WHATSAPP_CONSENT_VERSION,
    consent_updated_at: new Date().toISOString(),
  })
}

async function recordStop(contact: WhatsAppContactRecord, messageId: string) {
  const admin = createAdminClient()
  if (contact.business_id) {
    const { error } = await admin.from('balcao_whatsapp_consents').insert({
      business_id: contact.business_id,
      user_id: contact.user_id,
      wa_id: contact.wa_id,
      phone_e164: contact.phone_e164,
      status: 'revoked',
      consent_text: 'Usuário revogou o consentimento respondendo PARAR no WhatsApp.',
      policy_version: WHATSAPP_CONSENT_VERSION,
      source: 'whatsapp_stop',
      source_message_id: messageId,
    })
    if (error && error.code !== '23505') throw error
  }
  await updateContact(contact.wa_id, {
    consent_current: false,
    consent_version: WHATSAPP_CONSENT_VERSION,
    consent_updated_at: new Date().toISOString(),
  })
  await sendWhatsAppText(contact.wa_id, WHATSAPP_STOP_CONFIRMATION)
}

async function createLinkRequest(contact: WhatsAppContactRecord) {
  const token = randomBytes(24).toString('base64url')
  const admin = createAdminClient()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const { error } = await admin.from('balcao_whatsapp_link_requests').insert({
    token_hash: tokenHash(token),
    wa_id: contact.wa_id,
    expires_at: expiresAt,
  })
  if (error) throw error
  await updateContact(contact.wa_id, { state: 'awaiting_link' })
  return `${appUrl()}/whatsapp/vincular?token=${encodeURIComponent(token)}`
}

async function completeNewBusiness(contact: WhatsAppContactRecord, grant: boolean, messageId: string) {
  const businessName = contact.pending_business_name?.trim()
  if (!businessName) throw new Error('Business name missing from WhatsApp onboarding')
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('balcao_whatsapp_create_business', {
    p_wa_id: contact.wa_id,
    p_business_name: businessName,
    p_grant_consent: grant,
    p_policy_version: WHATSAPP_CONSENT_VERSION,
    p_consent_text: WHATSAPP_CONSENT_TEXT,
    p_source_message_id: messageId,
  })
  if (error) throw error
  if (!data) throw new Error('WhatsApp business creation returned no result')
  await sendWhatsAppText(contact.wa_id, `Pronto, ${businessName} está criado ✅\nSua conta do BALCÃO usa este número como contato no WhatsApp.`)
}

async function handleConsentChoice(contact: WhatsAppContactRecord, grant: boolean, messageId: string) {
  if (!contact.business_id) {
    await completeNewBusiness(contact, grant, messageId)
    return
  }
  if (grant) await recordGrant(contact, messageId)
  else await updateContact(contact.wa_id, { state: 'active', consent_current: false })
  await sendWhatsAppText(contact.wa_id, READY_TEXT)
}

async function handleMessage(message: InboundWhatsAppMessage) {
  let contact = await ensureContact(message.waId)

  // PARAR always wins over the current conversational state.
  if (isStopCommand(message.text) || isStopCommand(message.buttonTitle)) {
    await recordStop(contact, message.messageId)
    return
  }

  if (message.buttonId === WHATSAPP_BUTTON_IDS.createAccount) {
    await updateContact(contact.wa_id, { state: 'awaiting_business_name', pending_business_name: null })
    await sendWhatsAppText(contact.wa_id, 'Qual o nome da sua loja?')
    return
  }

  if (message.buttonId === WHATSAPP_BUTTON_IDS.existingAccount) {
    const url = await createLinkRequest(contact)
    await sendWhatsAppText(contact.wa_id, `Para ligar este WhatsApp à sua conta existente, confirme no site da RPG Capital:\n${url}\n\nO link expira em 15 minutos.`)
    return
  }

  if (message.buttonId === WHATSAPP_BUTTON_IDS.consentYes) {
    await handleConsentChoice(contact, true, message.messageId)
    return
  }

  if (message.buttonId === WHATSAPP_BUTTON_IDS.consentNo) {
    await handleConsentChoice(contact, false, message.messageId)
    return
  }

  contact = await ensureContact(message.waId)

  if (contact.state === 'awaiting_business_name') {
    const name = message.text.trim().slice(0, 120)
    if (name.length < 2) {
      await sendWhatsAppText(contact.wa_id, 'Me diga o nome da sua loja em uma mensagem de texto.')
      return
    }
    await updateContact(contact.wa_id, { state: 'awaiting_consent', pending_business_name: name })
    await sendWhatsAppButtons(contact.wa_id, WHATSAPP_CONSENT_QUESTION, CONSENT_BUTTONS)
    return
  }

  if (contact.state === 'awaiting_consent') {
    await sendWhatsAppButtons(contact.wa_id, WHATSAPP_CONSENT_QUESTION, CONSENT_BUTTONS)
    return
  }

  if (contact.state === 'awaiting_link') {
    const url = await createLinkRequest(contact)
    await sendWhatsAppText(contact.wa_id, `A confirmação da sua conta ainda está pendente. Use este link novo:\n${url}`)
    return
  }

  if (contact.state === 'active') {
    const command = message.text.trim().toLowerCase()
    if (!contact.consent_current && ['alerta', 'alertas', 'aviso', 'avisos'].includes(command)) {
      await updateContact(contact.wa_id, { state: 'awaiting_consent' })
      await sendWhatsAppButtons(contact.wa_id, WHATSAPP_CONSENT_QUESTION, CONSENT_BUTTONS)
      return
    }
    await sendWhatsAppText(contact.wa_id, READY_TEXT)
    return
  }

  await sendWhatsAppButtons(contact.wa_id, ENTRY_TEXT, ENTRY_BUTTONS)
}

export async function processWhatsAppWebhook(payload: unknown) {
  const messages = parseInboundWhatsAppMessages(payload)
  let firstError: Error | null = null

  for (const message of messages) {
    if (!await claimMessage(message)) continue
    try {
      await handleMessage(message)
      await finishMessage(message.messageId)
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error('Unknown WhatsApp webhook error')
      await finishMessage(message.messageId, error.message)
      console.error('BALCAO WhatsApp message processing failed', { messageId: message.messageId, message: error.message })
      firstError ??= error
    }
  }

  if (firstError) throw firstError
  return { ok: true, received: messages.length }
}
