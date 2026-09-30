// Conexão bancária vista pela Rafa: status da loja + link para conectar depois (/conectar-banco).
// O link NÃO faz login pelo WhatsApp: exige a conta Google do dono (link de WhatsApp pode ser encaminhado).

export const CONNECT_BANK_BASE = 'https://www.rpgcapital.com.br/conectar-banco'

export type BankStatus = 'conectado' | 'precisa_reconectar' | 'nao_conectado'

export function connectBankUrl(storeId: string) {
  return `${CONNECT_BANK_BASE}?loja=${encodeURIComponent(storeId)}`
}

export function bankStatusFrom(rows: Array<{ status?: string | null }>): BankStatus {
  const statuses = rows.map((row) => String(row.status || ''))
  if (statuses.some((status) => status === 'active' || status === 'updating' || status === 'pending')) return 'conectado'
  if (statuses.some((status) => status === 'attention' || status === 'error')) return 'precisa_reconectar'
  return 'nao_conectado'
}

export function bankMissingResult(storeId: string, status: BankStatus) {
  return {
    conectado: false,
    situacao: status === 'precisa_reconectar' ? 'a conexão com o banco caiu e precisa ser refeita' : 'o banco da loja ainda não foi conectado',
    link_conectar_banco: connectBankUrl(storeId),
    como_responder: 'Diga em 1 linha que sem o banco conectado você não vê saldo/extrato, e mande o link_conectar_banco (leva 2 minutos; entrar com o MESMO Google do cadastro). Não invente número nenhum.',
  }
}
