import 'server-only'

import { sendReplyButtons } from './whatsapp'
import { enqueueWhatsApp, isEvolutionProvider, RAFA_MAIN_MENU } from './whatsapp-evolution'

const MENU_BUTTONS = [
  { id: 'vender', title: 'Vender' },
  { id: 'ler_codigo', title: 'Ler código' },
  { id: 'prateleira', title: 'Prateleira' },
] as const

export const RAFA_MENU_FOOTER = 'Digite PARAR para não receber mais mensagens.'

export async function sendMenu(to: string, contexto?: string, options?: { inReplyTo?: string }) {
  const prefix = contexto?.trim() ? `${contexto.trim().slice(0, 240)}\n\n` : ''
  if (isEvolutionProvider()) {
    // Evolution: menu em texto numerado, com as 4 opções (sem limite de 3 botões).
    return enqueueWhatsApp({
      to,
      kind: 'menu_fallback',
      payload: { body: `${prefix}O que você quer fazer agora?`, buttons: RAFA_MAIN_MENU },
      inReplyTo: options?.inReplyTo,
      noMenu: true,
    })
  }
  return sendReplyButtons(
    to,
    `${prefix}Oi! Sou a Rafa. O que você quer fazer agora?\n— Rafa`,
    RAFA_MENU_FOOTER,
    MENU_BUTTONS.map((button) => ({ ...button })),
    options,
  )
}
