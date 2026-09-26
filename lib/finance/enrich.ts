// Extrato bancário → "de onde veio / pra onde foi".
// O open finance nem sempre traz favorecido/pagador; a descrição quase sempre traz.
// Tudo aqui é regra fixa (sem IA) e roda na leitura, então vale também para o histórico.

export type FlowGroup =
  | 'vendas_maquininha'
  | 'recebimentos_pix'
  | 'fornecedores'
  | 'contas_fixas'
  | 'impostos'
  | 'folha_e_servicos'
  | 'tarifas_e_juros'
  | 'investimentos'
  | 'retirada_do_dono'
  | 'transferencia_propria'
  | 'compras_no_cartao'
  | 'outros'

export const FLOW_LABEL: Record<FlowGroup, string> = {
  vendas_maquininha: 'vendas no cartão (maquininha)',
  recebimentos_pix: 'recebimentos por Pix',
  fornecedores: 'fornecedores',
  contas_fixas: 'contas fixas (aluguel, luz, água, internet)',
  impostos: 'impostos',
  folha_e_servicos: 'pessoas e serviços',
  tarifas_e_juros: 'tarifas, seguros e juros do banco',
  investimentos: 'investimentos',
  retirada_do_dono: 'retirada do dono',
  transferencia_propria: 'transferência entre contas próprias',
  compras_no_cartao: 'compras no cartão',
  outros: 'outros',
}

export type EnrichInput = {
  amountCents: number
  description?: string | null
  counterpartyName?: string | null
  counterpartyTaxId?: string | null
  category?: string | null
  transactionType?: string | null
  isInternalTransfer?: boolean | null
}

export type Enriched = {
  counterparty: string | null
  channel: 'pix' | 'cartao' | 'boleto' | 'ted' | 'investimento' | 'tarifa' | 'outro'
  group: FlowGroup
  acquirer: string | null
}

const norm = (value: string) => value
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/\s+/g, ' ').trim()

function titleCase(value: string) {
  const small = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E'])
  return value.toLowerCase().split(' ').filter(Boolean).map((word, index) => {
    const upper = word.toUpperCase()
    if (index > 0 && small.has(upper)) return word
    if (['LTDA', 'S.A.', 'SA', 'ME', 'EPP', 'EIRELI', 'CDB'].includes(upper)) return upper
    return word.charAt(0).toUpperCase() + word.slice(1)
  }).join(' ')
}

const ACQUIRERS: Array<[RegExp, string]> = [
  [/\bGETNET\b/, 'Getnet'],
  [/\bSTONE\b/, 'Stone'],
  [/\bTON\b.*\bPAGAMENTOS?\b|\bSTONE PAGAMENTOS\b/, 'Ton/Stone'],
  [/\bCIELO\b/, 'Cielo'],
  [/\bREDE\s+(?:PAGAMENTOS?|CARD|S\.?A)\b|\bREDECARD\b/, 'Rede'],
  [/\bPAGSEGURO\b|\bPAGBANK\b/, 'PagBank'],
  [/\bMERCADO\s*PAGO\b|\bMERCADOPAGO\b/, 'Mercado Pago'],
  [/\bSAFRAPAY\b/, 'SafraPay'],
  [/\bSUMUP\b/, 'SumUp'],
  [/\bINFINITEPAY\b|\bCLOUDWALK\b/, 'InfinitePay'],
  [/\bVERO\b.*\bBANRISUL\b/, 'Vero'],
  [/\bSICREDI\b.*\bMAQUININHA\b/, 'Sicredi'],
]

// Nome limpo da contraparte a partir da descrição.
export function counterpartyFromDescription(description: string, transactionType?: string | null): string | null {
  const raw = String(description || '').toUpperCase()
  // Cartão: "OXXO OLIMPIA           SAO PAULO     BRA" (loja, cidade, país em colunas).
  // Layout padrão: loja (22) + espaço + cidade (13) + espaço + país (3).
  const fixed = raw.trimEnd().length === 40 && raw[22] === ' ' && /\s[A-Z]{3}$/.test(raw.trimEnd())
  const cardLayout = fixed || /\S\s{2,}\S.*\s[A-Z]{3}\s*$/.test(raw)
  let text = fixed ? norm(raw.slice(0, 22)) : cardLayout ? norm(raw.split(/\s{2,}/)[0]) : norm(raw)
  if (!text) return null
  if (!cardLayout) {
    const patterns: RegExp[] = [
      /^DEVOL(?:UCAO)? RECEBIDA PIX DE (.+)$/,
      /^PIX (?:ENVIADO|TRANSFERIDO|PAGO) (?:PARA|A) (.+)$/,
      /^PIX RECEBIDO(?: C\d)?(?: DE)? (.+)$/,
      /^(?:TED|DOC|TRANSF(?:ERENCIA)?)(?: ENVIADA| RECEBIDA| ENVIADO| RECEBIDO)?(?: PARA| DE) (.+)$/,
      /^PAGAMENTO (?:DE BOLETO|BOLETO|DE CONTA)(?: -)? (.+)$/,
      /^(?:COMPRA|DEBITO|CREDITO) (?:NO )?CARTAO(?: -)? (.+)$/,
    ]
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) { text = match[1]; break }
    }
  }
  if (/^(C\d|PIX RECEBIDO(?: C\d)?|DEBITO DE CARTAO|PIX ENVIADO|MOVIMENTACAO|PIX)$/.test(text)) return null
  let prefix = ''
  const star = text.match(/^([A-Z0-9]{2,5})\s?\*\s?(.+)$/)
  if (star) {
    const brands: Record<string, string> = { IFD: 'iFood', MP: 'Mercado Pago', PAG: 'PagBank', PG: 'PagBank', UBER: 'Uber', SUMUP: 'SumUp', STN: 'Stone' }
    prefix = brands[star[1]] ?? ''
    text = star[2]
  }
  // "12.345.678 FULANO" (MEI com CNPJ no nome) → "FULANO"
  text = text.replace(/^\d{2}\.\d{3}\.\d{3}(?:\/\d{4}-\d{2})?\s+/, '').replace(/^\d{3,}\s*-?\s*/, '').trim()
  if (!text || text.length < 2) return prefix || null
  const name = titleCase(text).slice(0, 80)
  return prefix ? `${prefix} · ${name}` : name
}

export function detectAcquirer(input: EnrichInput): string | null {
  if (input.amountCents <= 0) return null
  const combined = norm(`${input.counterpartyName || ''} ${input.description || ''}`)
  for (const [pattern, name] of ACQUIRERS) if (pattern.test(combined)) return name
  return null
}

function channelOf(input: EnrichInput): Enriched['channel'] {
  const type = String(input.transactionType || '').toUpperCase()
  const text = norm(`${input.description || ''} ${input.category || ''}`)
  if (type === 'PIX' || /\bPIX\b/.test(text)) return 'pix'
  if (type === 'CARTAO' || /CARTAO/.test(text)) return 'cartao'
  if (type === 'BOLETO' || /BOLETO/.test(text)) return 'boleto'
  if (/\bTED\b|\bDOC\b|TRANSFERENCIA/.test(type + ' ' + text)) return 'ted'
  if (/APLIC|RESGATE|CDB|INVEST|POUPANCA|TESOURO/.test(type + ' ' + text)) return 'investimento'
  if (/TARIFA|SEGURO|IOF|JUROS|ANUIDADE|MENSALIDADE PACOTE/.test(text)) return 'tarifa'
  return 'outro'
}

const RE_TAX = /\bDAS\b|SIMPLES NACIONAL|\bDARF\b|RECEITA FEDERAL|\bGPS\b|\bINSS\b|\bFGTS\b|PREFEITURA|\bISS\b|\bICMS\b|SEFAZ|\bIPTU\b|\bIPVA\b|DETRAN|\bGNRE\b/
const RE_FIXED = /ALUGUEL|CONDOMINIO|ENEL|\bCPFL\b|LIGHT S|ELETROPAULO|CEMIG|COPEL|CELESC|ENERGISA|NEOENERGIA|COELBA|EQUATORIAL|SABESP|COPASA|SANEPAR|CEDAE|\bAGUA\b|\bCOMGAS\b|NATURGY|VIVO|\bCLARO\b|\bTIM\b|\bOI\b|NET SERVICOS|INTERNET|TELEFONICA|ENERGIA|IMOBILIARIA/
const RE_BANK_FEES = /TARIFA|SEGURO CONTA|\bIOF\b|JUROS|ANUIDADE|CESTA DE SERVICOS|PACOTE DE SERVICOS|ENCARGOS|MULTA/
const RE_INVEST = /APLIC|RESGATE|\bCDB\b|\bLCI\b|\bLCA\b|INVEST|POUPANCA|TESOURO|RENDIMENTO/
const RE_COMPANY = /\bLTDA\b|\bS\.?A\.?\b|\bEIRELI\b|\bME\b|\bEPP\b|DISTRIBUI|ATACAD|COMERCIO|INDUSTRIA|ALIMENTOS|BEBIDAS|LATICINIO|FRIGORIFIC|EMBALAGE|IMPORTADORA|REPRESENTAC/
const RE_PERSON = /^[A-Z]+(?: (?:DA|DE|DO|DAS|DOS|E))?(?: [A-Z]+){1,5}$/

// ownerNames: nomes do dono/empresa (normalizados) para achar retirada e transferência própria.
export function enrichTransaction(input: EnrichInput, ownerNames: string[] = []): Enriched {
  const counterparty = (input.counterpartyName && input.counterpartyName.trim())
    ? titleCase(norm(input.counterpartyName))
    : counterpartyFromDescription(String(input.description || ''), input.transactionType)
  const channel = channelOf(input)
  const acquirer = detectAcquirer(input)
  const who = norm(counterparty || '')
  const text = norm(`${input.description || ''} ${input.category || ''} ${counterparty || ''}`)
  const isOwner = Boolean(who) && ownerNames.some((owner) => owner && (who.includes(owner) || owner.includes(who)))
  const credit = input.amountCents > 0

  let group: FlowGroup
  if (input.isInternalTransfer) group = 'transferencia_propria'
  else if (acquirer) group = 'vendas_maquininha'
  else if (channel === 'investimento' || RE_INVEST.test(text)) group = 'investimentos'
  else if (isOwner) group = credit ? 'transferencia_propria' : 'retirada_do_dono'
  else if (RE_TAX.test(text)) group = 'impostos'
  else if (RE_BANK_FEES.test(text)) group = 'tarifas_e_juros'
  else if (RE_FIXED.test(text)) group = 'contas_fixas'
  else if (credit) group = channel === 'pix' || channel === 'ted' ? 'recebimentos_pix' : 'outros'
  else if (channel === 'cartao') group = 'compras_no_cartao'
  else if (RE_COMPANY.test(who) || input.counterpartyTaxId?.replace(/\D/g, '').length === 14) group = 'fornecedores'
  else if ((channel === 'pix' || channel === 'ted') && RE_PERSON.test(who)) group = 'folha_e_servicos'
  else if (channel === 'boleto') group = 'fornecedores'
  else group = 'outros'

  return { counterparty, channel, group, acquirer }
}

export type FlowTransaction = EnrichInput & { postedAt: string }

type Bucket = { name: string; totalCents: number; count: number }

function addTo(map: Map<string, Bucket>, name: string, cents: number) {
  const bucket = map.get(name) || { name, totalCents: 0, count: 0 }
  bucket.totalCents += cents
  bucket.count += 1
  map.set(name, bucket)
}

export type MoneyFlow = ReturnType<typeof analyzeMoneyFlow>

// Resumo completo: origens, destinos, grupos, recorrentes, maiores lançamentos e cruzamentos.
export function analyzeMoneyFlow(input: {
  transactions: FlowTransaction[]
  ownerNames?: string[]
  // vendas registradas no Balcão no mesmo período (para conferir com o que caiu no banco)
  sales?: { cardCents: number; pixCents: number; cashCents: number }
  // fornecedores das notas lançadas (nome normalizado → total das notas)
  invoiceSuppliers?: Array<{ name: string; totalCents: number }>
}) {
  const owners = (input.ownerNames || []).map(norm).filter((name) => name.length >= 5)
  const inflowBy = new Map<string, Bucket>()
  const outflowBy = new Map<string, Bucket>()
  const groupIn = new Map<FlowGroup, number>()
  const groupOut = new Map<FlowGroup, number>()
  const monthly = new Map<string, Map<string, number[]>>() // contraparte → mês → valores
  const enriched = input.transactions.map((transaction) => ({ transaction, info: enrichTransaction(transaction, owners) }))
  let inflow = 0
  let outflow = 0
  let unknownOut = 0

  for (const { transaction, info } of enriched) {
    const cents = Number(transaction.amountCents)
    const name = info.acquirer || info.counterparty || 'não identificado'
    if (cents > 0) {
      inflow += cents
      addTo(inflowBy, name, cents)
      groupIn.set(info.group, (groupIn.get(info.group) || 0) + cents)
    } else {
      outflow += cents
      if (!info.counterparty) unknownOut += cents
      addTo(outflowBy, name, cents)
      groupOut.set(info.group, (groupOut.get(info.group) || 0) + cents)
      if (info.counterparty && info.group !== 'compras_no_cartao') {
        const month = transaction.postedAt.slice(0, 7)
        const byMonth = monthly.get(info.counterparty) || new Map<string, number[]>()
        byMonth.set(month, [...(byMonth.get(month) || []), cents])
        monthly.set(info.counterparty, byMonth)
      }
    }
  }

  const top = (map: Map<string, Bucket>, sign: 1 | -1, limit = 10) => [...map.values()]
    .sort((a, b) => sign * (b.totalCents - a.totalCents))
    .slice(0, limit)
  const groups = (map: Map<FlowGroup, number>, total: number) => [...map.entries()]
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([group, cents]) => ({ group, label: FLOW_LABEL[group], totalCents: cents, share: total ? Math.round(Math.abs(cents) * 100 / Math.abs(total)) : 0 }))

  // Recorrente: mesma contraparte em 2+ meses diferentes.
  const recurring = [...monthly.entries()]
    .filter(([, months]) => months.size >= 2)
    .map(([name, months]) => {
      const totals = [...months.values()].map((values) => values.reduce((sum, value) => sum + value, 0))
      return { name, months: months.size, averageCents: Math.round(totals.reduce((sum, value) => sum + value, 0) / totals.length) }
    })
    .sort((a, b) => a.averageCents - b.averageCents)
    .slice(0, 8)

  const biggest = (sign: 1 | -1) => enriched
    .filter(({ transaction }) => sign > 0 ? transaction.amountCents > 0 : transaction.amountCents < 0)
    .sort((a, b) => sign * (b.transaction.amountCents - a.transaction.amountCents))
    .slice(0, 5)
    .map(({ transaction, info }) => ({ date: transaction.postedAt.slice(0, 10), name: info.acquirer || info.counterparty || String(transaction.description || '').slice(0, 40), amountCents: transaction.amountCents }))

  const receivedFromAcquirers = groupIn.get('vendas_maquininha') || 0
  const receivedPix = groupIn.get('recebimentos_pix') || 0
  const reconciliation = input.sales ? {
    cardSoldCents: input.sales.cardCents,
    cardReceivedCents: receivedFromAcquirers,
    pixSoldCents: input.sales.pixCents,
    pixReceivedCents: receivedPix,
    cashSoldCents: input.sales.cashCents,
  } : null

  const supplierPayments = input.invoiceSuppliers?.map((supplier) => {
    const key = norm(supplier.name).split(' ').slice(0, 2).join(' ')
    const paid = [...outflowBy.values()].filter((bucket) => key && norm(bucket.name).includes(key)).reduce((sum, bucket) => sum + bucket.totalCents, 0)
    return { name: supplier.name, invoicesCents: supplier.totalCents, paidCents: paid }
  }) || []

  return {
    inflowCents: inflow,
    outflowCents: outflow,
    resultCents: inflow + outflow,
    identifiedOutShare: outflow ? Math.round((outflow - unknownOut) * 100 / outflow) : 100,
    topSources: top(inflowBy, 1),
    topDestinations: top(outflowBy, -1),
    inflowByGroup: groups(groupIn, inflow),
    outflowByGroup: groups(groupOut, outflow),
    recurring,
    biggestIn: biggest(1),
    biggestOut: biggest(-1),
    reconciliation,
    supplierPayments,
  }
}

// Nomes do dono: o MEI aparece no extrato como "57.114.756 FULANO" (raiz do CNPJ + nome).
export function ownerNamesFromTaxId(descriptions: string[], taxId?: string | null) {
  const digits = String(taxId || '').replace(/\D/g, '')
  if (digits.length < 8) return []
  const root = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}`
  const names = new Set<string>()
  for (const description of descriptions) {
    const index = description.indexOf(root)
    if (index < 0) continue
    const name = norm(description.slice(index + root.length)).replace(/^[\s\/\d-]+/, '')
    if (name.length >= 5) names.add(name)
  }
  return [...names]
}
