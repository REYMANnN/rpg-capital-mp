/** Motivos (opcionais) da página /newsletter/sair. Compartilhado entre a página e a API. */
export const UNSUBSCRIBE_REASONS = [
  'Não tenho mais interesse',
  'Achei ruim o conteúdo',
  'Já assino muita coisa',
  'Criei só para experimentar',
] as const

export type UnsubscribeReason = (typeof UNSUBSCRIBE_REASONS)[number]
