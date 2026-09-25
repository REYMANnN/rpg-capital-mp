export const BALCAO_FLOWS = ['vender', 'ler-codigo', 'prateleira', 'entrada'] as const

export type BalcaoFlow = (typeof BALCAO_FLOWS)[number]

export function isBalcaoFlow(value: unknown): value is BalcaoFlow {
  return typeof value === 'string' && (BALCAO_FLOWS as readonly string[]).includes(value)
}

export const FLOW_LABEL: Record<BalcaoFlow, string> = {
  vender: 'Vender',
  'ler-codigo': 'Ler código',
  prateleira: 'Prateleira',
  entrada: 'Subir estoque',
}
