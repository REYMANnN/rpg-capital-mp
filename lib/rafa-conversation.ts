export type ConversationButton = { id: string; title: string }

const YES = new Set(['sim', 's', 'ss', 'pode', 'isso', 'ok', 'confirma', 'confirmo', 'beleza', '👍', '1'])
const NO = new Set(['nao', 'n', 'errado', '👎', '2'])

function normalize(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.!?]+$/g, '').replace(/\s+/g, ' ').trim()
}

export function confirmationTextId(text: string): 'confirm_yes' | 'confirm_no' | null {
  const value = normalize(text)
  if (YES.has(value)) return 'confirm_yes'
  if (NO.has(value)) return 'confirm_no'

  // Também serve para a pergunta "a nota está completa?". Os números são atalhos;
  // texto natural e transcrição de áudio continuam sendo aceitos.
  if (
    /^(acabou|terminei|finalizei|pronto|so isso|e so isso|esta completa|ta completa|completa|ultima foto|essa (e|foi) a ultima|essa e a ultima foto)$/.test(value)
    || /\b(pode (processar|ler|seguir|continuar|fazer)|ja pode (processar|ler|seguir)|essa (e|foi) a ultima|terminei|finalizei|acabou)\b/.test(value)
  ) return 'confirm_yes'

  if (
    /^(ainda nao|nao ainda|ainda falta|tem mais|falta mais uma|mais uma|mais uma foto|vou mandar mais|vou enviar mais|vou mandar outra|vou enviar outra|vou enviar outra foto|vou mandar outra foto)$/.test(value)
    || /\b(ainda falta|tem mais|falta mais|vou (mandar|enviar).*(mais|outra|foto))\b/.test(value)
  ) return 'confirm_no'

  return null
}

export function isConfirmationButtonSet(buttons: ConversationButton[]) {
  const ids = new Set(buttons.map((button) => button.id))
  return (ids.has('confirm_yes') && ids.has('confirm_no'))
    || (buttons.length === 2 && buttons.some((button) => /^(sim|yes)$/i.test(button.title)) && buttons.some((button) => /^(nao|não|no)$/i.test(button.title)))
}

export function fallbackTextForButtons(payload: { body?: unknown; buttons?: ConversationButton[] }) {
  const body = String(payload.body ?? '').trim()
  const buttons = Array.isArray(payload.buttons) ? payload.buttons : []
  if (isConfirmationButtonSet(buttons)) return `${body}\n\nResponde *sim* ou *não*.`
  const options = buttons.map((button, index) => `${index + 1} - ${button.title}`).join('\n')
  return options ? `${body}\n\n${options}\n\nResponda com o número da opção.` : body
}
