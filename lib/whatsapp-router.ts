export type WhatsAppIntent =
  | 'opt_out'
  | 'opt_in'
  | 'produto_por_ean'
  | 'consulta'
  | 'registrar_venda'
  | 'entrada_estoque'
  | 'desconhecida'

const CONSULTA_PREFIXES = ['saldo', 'caixa', 'quanto vendi', 'quanto entrou', 'vendas de', 'fechamento']
const VENDA_PREFIXES = ['vendi', 'venda', 'vendeu']
const ENTRADA_PREFIXES = ['entrou', 'comprei', 'chegou', 'entrada']

export function normalizeWhatsAppText(text: string) {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function startsWithWholePrefix(text: string, prefix: string) {
  if (text === prefix) return true
  if (!text.startsWith(prefix)) return false
  const next = text[prefix.length]
  return next !== undefined && !/[\p{L}\p{N}_]/u.test(next)
}

function hasPrefix(text: string, prefixes: string[]) {
  return prefixes.some((prefix) => startsWithWholePrefix(text, prefix))
}

export function isValidGtin(value: string) {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false

  const digits = [...value].map(Number)
  const checkDigit = digits.pop()!
  let sum = 0

  for (let i = digits.length - 1, positionFromRight = 0; i >= 0; i--, positionFromRight++) {
    sum += digits[i] * (positionFromRight % 2 === 0 ? 3 : 1)
  }

  return (10 - (sum % 10)) % 10 === checkDigit
}

export function classifyWhatsAppText(text: string): { intent: WhatsAppIntent; normalizedText: string } {
  const normalizedText = normalizeWhatsAppText(text)

  if (normalizedText === 'parar') return { intent: 'opt_out', normalizedText }
  if (normalizedText === 'voltar') return { intent: 'opt_in', normalizedText }
  if (isValidGtin(normalizedText)) return { intent: 'produto_por_ean', normalizedText }
  if (hasPrefix(normalizedText, CONSULTA_PREFIXES)) return { intent: 'consulta', normalizedText }
  if (hasPrefix(normalizedText, VENDA_PREFIXES)) return { intent: 'registrar_venda', normalizedText }
  if (hasPrefix(normalizedText, ENTRADA_PREFIXES)) return { intent: 'entrada_estoque', normalizedText }

  return { intent: 'desconhecida', normalizedText }
}

export function replyForIntent(intent: WhatsAppIntent) {
  switch (intent) {
    case 'opt_out':
      return 'Pronto, você não vai mais receber mensagens da RPG Capital. Para voltar, mande VOLTAR.'
    case 'opt_in':
      return 'Pronto, você voltou a receber mensagens da RPG Capital.'
    case 'produto_por_ean':
      return 'Entendi: você enviou um código de produto válido. A consulta por EAN chega no próximo passo.'
    case 'consulta':
      return 'Entendi: você quer consultar seus dados. Essa consulta chega no próximo passo.'
    case 'registrar_venda':
      return 'Entendi: você quer registrar uma venda. O registro no estoque chega no próximo passo.'
    case 'entrada_estoque':
      return 'Entendi: você quer registrar uma entrada de estoque. A atualização do estoque chega no próximo passo.'
    default:
      return 'Ainda não consegui identificar esse pedido. Em breve vou entender mais comandos por aqui.'
  }
}
