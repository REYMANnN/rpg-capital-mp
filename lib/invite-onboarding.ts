export const DEFAULT_RAFA_WHATSAPP_NUMBER = '5511936201445'

function normalizePhone(value: string) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

export function rafaWhatsAppLink(storeName: string, phone = DEFAULT_RAFA_WHATSAPP_NUMBER) {
  const number = normalizePhone(phone) || DEFAULT_RAFA_WHATSAPP_NUMBER
  const text = `Olá, Rafa! Sou novo por aqui. Minha loja é ${storeName.trim()}.`
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}
