export type WelcomeStore = {
  id: string
  name: string
  businessId?: string
  rafaWelcomedAt?: string | null
}

export type WelcomeDecision = 'none' | 'confirm' | 'select' | 'normal'

export function formatWelcomePhone(value: string) {
  const digits = String(value || '').replace(/\D/g, '')
  const national = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits
  const phone = national.slice(-11)
  if (phone.length === 11) return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`
  if (phone.length === 10) return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`
  return digits
}

export function welcomeDecision(rafaWelcomedAt: string | null | undefined, stores: WelcomeStore[]): WelcomeDecision {
  if (rafaWelcomedAt) return 'normal'
  if (!stores.length) return 'none'
  if (stores.length === 1) return 'confirm'
  return 'select'
}

export function welcomeConfirmationMessage(phone: string, storeName: string) {
  return `Olá, seja muito bem-vindo! 👋 Sou a Rafa, assistente da RPG. Achei seu número aqui na base: ${formatWelcomePhone(phone)}. Você é da *${storeName}*? Responde sim ou não.`
}

export function welcomeStorePickMessage() {
  return 'Achei mais de uma loja com seu número. Qual é a sua?'
}

export function welcomeTutorialMessage(firstName: string) {
  const name = firstName.trim() || 'tudo bem'
  return `Perfeito, ${name}! Aqui é assim: 🛒 *Vender*: me fala o que vendeu (ex.: 'vendi 2 coca 2L no pix'). 📷 *Ler código*: te mando a câmera pra escanear. 🧾 *Nota de mercadoria*: manda a foto e eu subo pro estoque. 💬 E pode me perguntar qualquer coisa: preço, estoque, quanto vendeu, saldo do banco.`
}

export function welcomeStockMessage() {
  return 'Pra começar, vamos montar seu estoque? Escolhe o jeito mais fácil: 📸 foto do seu controle (caderno ou planilha); 🗣️ me fala os produtos por áudio ou texto; 🧾 me manda notas antigas de compra; 📦 ou vai me mandando as notas novas conforme a mercadoria chega.'
}

export function welcomeRefusalMessage() {
  return 'Sem problema! Esse número não está ligado a outra loja aqui. Confere com quem te mandou o convite.'
}
