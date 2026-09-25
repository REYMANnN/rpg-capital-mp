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

// Texto curto que acompanha o link de cada fluxo no WhatsApp.
export const FLOW_HINT: Record<BalcaoFlow, string> = {
  vender: 'Caixa aberto: leia os produtos com a câmera e finalize a venda.',
  'ler-codigo': 'Aponte a câmera para o código de barras e veja o produto (dá para editar).',
  prateleira: 'Todos os seus produtos, com busca.',
  entrada: 'Subir estoque: leia o código do produto ou a chave da nota fiscal.',
}

// Pedidos diretos de link ("abre as vendas", "manda o link da prateleira"...), sem passar pela IA.
export function directFlowRequest(text: string): BalcaoFlow | null {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (t.split(' ').length > 8) return null
  const wantsOpen = /\b(abr[ae]|abrir|abra|abre ai|link|manda|mande|me da|ir para|vai para|entrar)\b/.test(t)
  if (!wantsOpen) return null
  if (/\b(subir estoque|entrada|dar entrada|repor|reposicao|nota fiscal)\b/.test(t)) return 'entrada'
  if (/\b(ler codigo|ler o codigo|leitor|scanner|escanear|bipar)\b/.test(t)) return 'ler-codigo'
  if (/\b(prateleira|estoque|produtos|inventario)\b/.test(t)) return 'prateleira'
  if (/\b(venda|vendas|vender|caixa|pdv)\b/.test(t)) return 'vender'
  return null
}

export function isMenuRequest(text: string) {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]+/g, '').trim()
  return ['menu', 'opcoes', 'opcao', 'ajuda', 'inicio', 'comecar'].includes(t)
}

export function isGreeting(text: string) {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]+/g, '').trim()
  return /^(oi+|ola|eai|eia|eae|e ai|opa|bom dia|boa tarde|boa noite|salve|hey|oi rafa|ola rafa|oie)$/.test(t)
}
