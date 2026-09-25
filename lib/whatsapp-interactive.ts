import { isBalcaoFlow, type BalcaoFlow } from './whatsapp-flows'

const BUTTON_TO_FLOW: Record<string, BalcaoFlow> = {
  vender: 'vender',
  ler_codigo: 'ler-codigo',
  prateleira: 'prateleira',
  entrada: 'entrada',
}

export function interactiveButtonId(message: any): string | null {
  if (message?.type !== 'interactive') return null
  const id = message?.interactive?.button_reply?.id
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

export function interactiveFlow(message: any): BalcaoFlow | null {
  const id = interactiveButtonId(message)
  if (!id) return null
  const mapped = BUTTON_TO_FLOW[id]
  return isBalcaoFlow(mapped) ? mapped : null
}

export function flowIntent(flow: BalcaoFlow): 'vender' | 'ler_codigo' | 'prateleira' | 'entrada' {
  return flow === 'ler-codigo' ? 'ler_codigo' : flow
}
