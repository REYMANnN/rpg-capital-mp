export const INVITE_SITE_URL = 'https://www.rpgcapital.com.br'

export function normalizeInvitePhone(value: string) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

export function inviteLink(code: string) {
  return `${INVITE_SITE_URL}/convite/${String(code || '').trim().toUpperCase()}`
}

export function inviteMessage(name: string, link: string) {
  return `Oi, ${name.trim()}! Criei um acesso pra você testar o Balcão da RPG, de graça. Leva 3 minutos: ${link}`
}

export function billingMessage(name: string, priceCents: number, pixKey: string) {
  const value = (priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return `Oi, ${name.trim()}! Curtiu o Balcão? A assinatura é ${value}/mês. Pix: ${pixKey.trim()}. Qualquer dúvida é só chamar.`
}

export function paidUntilDate(paidAt: Date | string) {
  const date = typeof paidAt === 'string' ? new Date(paidAt) : new Date(paidAt.getTime())
  date.setUTCDate(date.getUTCDate() + 30)
  return date.toISOString().slice(0, 10)
}

export function inviteWhatsAppUrl(phone: string, message: string) {
  const normalized = normalizeInvitePhone(phone)
  return normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}` : ''
}
