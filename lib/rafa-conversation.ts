export type ConversationButton = { id: string; title: string }

const YES = new Set(['sim', 's', 'ss', 'pode', 'isso', 'ok', 'confirma', 'confirmo', 'beleza', '👍'])
const NO = new Set(['nao', 'n', 'cancela', 'errado', '👎'])

function normalize(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.!?]+$/g, '').trim()
}

export function confirmationTextId(text: string): 'confirm_yes' | 'confirm_no' | null {
  const value = normalize(text)
  if (YES.has(value)) return 'confirm_yes'
  if (NO.has(value)) return 'confirm_no'
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
