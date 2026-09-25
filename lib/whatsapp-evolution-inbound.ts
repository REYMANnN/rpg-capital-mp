/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only'

import { EVOLUTION_MEDIA_PREFIX } from '@/lib/rafa-media'
import { lastOutboundWasTextMenu, normalizePhone, RAFA_MAIN_MENU } from '@/lib/whatsapp-evolution'

type JsonRecord = Record<string, any>

// Converte uma mensagem da Evolution (Baileys) para o formato da Cloud API
// ({ contacts, messages }) que o processamento da Rafa já entende.

function jidToPhone(key: JsonRecord): string | null {
  const candidates = [key.remoteJid, key.remoteJidAlt, key.senderPn, key.participant]
  for (const jid of candidates) {
    if (typeof jid === 'string' && jid.endsWith('@s.whatsapp.net')) return normalizePhone(jid)
  }
  return null
}

function timestampOf(value: unknown): string {
  const raw = typeof value === 'object' && value !== null && 'low' in value ? (value as { low: number }).low : value
  const seconds = Number(raw)
  return String(Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : Math.floor(Date.now() / 1000))
}

function buttonReplyId(message: JsonRecord): { id: string; title: string } | null {
  const native = message.interactiveResponseMessage?.nativeFlowResponseMessage
  if (native?.paramsJson) {
    try {
      const params = JSON.parse(native.paramsJson)
      if (typeof params?.id === 'string' && params.id) {
        return { id: params.id, title: String(message.interactiveResponseMessage?.body?.text || params.display_text || '') }
      }
    } catch {}
  }
  const legacy = message.buttonsResponseMessage
  if (typeof legacy?.selectedButtonId === 'string') {
    return { id: legacy.selectedButtonId, title: String(legacy.selectedDisplayText || '') }
  }
  const template = message.templateButtonReplyMessage
  if (typeof template?.selectedId === 'string') {
    return { id: template.selectedId, title: String(template.selectedDisplayText || '') }
  }
  return null
}

function unwrap(message: JsonRecord): JsonRecord {
  // Mensagens "efêmeras"/"view once"/documento com legenda vêm embrulhadas.
  for (const wrapper of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']) {
    const inner = message?.[wrapper]?.message
    if (inner && typeof inner === 'object') return unwrap(inner)
  }
  return message
}

export async function evolutionToCloudValue(data: JsonRecord): Promise<{ value: JsonRecord; skip?: string } | { value: null; skip: string }> {
  const key: JsonRecord = data?.key ?? {}
  if (key.fromMe) return { value: null, skip: 'from_me' }
  const remoteJid = String(key.remoteJid || '')
  if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) {
    return { value: null, skip: 'not_direct_chat' }
  }
  const id = typeof key.id === 'string' ? key.id : ''
  const phone = jidToPhone(key)
  if (!id || !phone) return { value: null, skip: 'missing_id_or_phone' }

  const message = unwrap(data?.message ?? {})
  const base: JsonRecord = { id, from: phone, timestamp: timestampOf(data?.messageTimestamp) }
  let out: JsonRecord | null = null

  const button = buttonReplyId(message)
  const text = typeof message.conversation === 'string' ? message.conversation
    : typeof message.extendedTextMessage?.text === 'string' ? message.extendedTextMessage.text
      : null

  if (button) {
    out = { ...base, type: 'interactive', interactive: { type: 'button_reply', button_reply: button } }
  } else if (text !== null) {
    // Número sozinho vira clique, sem passar pela IA:
    // - se a última mensagem foi uma lista (menu, Sim/Não, escolha de loja), vale a opção dela;
    // - senão, 1 a 4 são sempre o menu principal (vender, ler código, prateleira, subir estoque).
    const choice = text.trim().match(/^([1-9])\s*$/)
    const menu = choice ? (await lastOutboundWasTextMenu(phone)) || RAFA_MAIN_MENU : null
    const picked = menu?.[Number(choice?.[1]) - 1]
    out = picked
      ? { ...base, type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: picked.id, title: picked.title } } }
      : { ...base, type: 'text', text: { body: text } }
  } else if (message.imageMessage) {
    out = { ...base, type: 'image', image: { id: `${EVOLUTION_MEDIA_PREFIX}${id}`, mime_type: message.imageMessage.mimetype, caption: message.imageMessage.caption } }
  } else if (message.audioMessage) {
    out = { ...base, type: 'audio', audio: { id: `${EVOLUTION_MEDIA_PREFIX}${id}`, mime_type: message.audioMessage.mimetype } }
  } else if (message.documentMessage) {
    out = {
      ...base,
      type: 'document',
      document: {
        id: `${EVOLUTION_MEDIA_PREFIX}${id}`,
        mime_type: message.documentMessage.mimetype,
        filename: message.documentMessage.fileName,
        caption: message.documentMessage.caption,
      },
    }
  } else {
    out = { ...base, type: 'unsupported' }
  }

  const profileName = typeof data?.pushName === 'string' ? data.pushName : null
  return {
    value: {
      contacts: [{ wa_id: phone, profile: profileName ? { name: profileName } : {} }],
      messages: [out],
    },
  }
}
