import 'server-only'

import { sendReplyButtons } from './whatsapp'

const MENU_BUTTONS = [
  { id: 'vender', title: 'Vender' },
  { id: 'ler_codigo', title: 'Ler código' },
  { id: 'prateleira', title: 'Prateleira' },
] as const

export const RAFA_MENU_FOOTER = 'Digite PARAR para não receber mais mensagens.'

export async function sendMenu(to: string, contexto?: string, options?: { inReplyTo?: string }) {
  const prefix = contexto?.trim() ? `${contexto.trim().slice(0, 240)}\n\n` : ''
  return sendReplyButtons(
    to,
    `${prefix}Oi! Sou a Rafa. O que você quer fazer agora?\n— Rafa`,
    RAFA_MENU_FOOTER,
    MENU_BUTTONS.map((button) => ({ ...button })),
    options,
  )
}
