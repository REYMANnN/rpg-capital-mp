import 'server-only'

import { claudeEnabled, claudeMessages, claudeModel, claudeText, imageBlockFromDataUri, type ClaudeContentBlock } from '@/lib/llm/claude'
import { rafaAiBudgetAvailable, recordAiError, recordAiUsage } from '@/lib/rafa-ai-usage'
import {
  chunk,
  groqAudioFilename,
  groqAudioMime,
  mergeInvoiceExtractions,
  normalizeInvoiceExtraction,
  parseModelJson,
  type InvoiceExtraction,
} from '@/lib/rafa-ai-parse'

const GROQ_BASE = 'https://api.groq.com/openai/v1'
export const RAFA_TEXT_MODEL = 'openai/gpt-oss-20b'
// qwen3.6-27b foi desligado pela Groq em 14/09/2026; sucessor direto é o qwen3.8-27b.
// Variável de ambiente permite trocar/voltar sem deploy de código.
export const RAFA_VISION_MODEL = process.env.RAFA_VISION_MODEL?.trim() || 'qwen/qwen3.8-27b'
// Limite do modelo de visão: no máximo 3 imagens por chamada.
const VISION_MAX_IMAGES = 3
export const RAFA_AUDIO_MODEL = 'whisper-large-v3-turbo'

type Usage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

function groqKey() {
  const key = process.env.GROQ_API_KEY?.trim()
  if (!key) throw new Error('GROQ_API_KEY is not configured')
  return key
}

export { rafaAiBudgetAvailable, recordAiError, recordAiUsage } from '@/lib/rafa-ai-usage'

// Preços Groq em US$ por 1M tokens (entrada / saída).
function tokenCost(model: string, usage: Usage) {
  const input = Number(usage.prompt_tokens || 0)
  const output = Number(usage.completion_tokens || 0)
  if (model.includes('qwen3.8')) return (input * 0.80 + output * 4.00) / 1_000_000
  if (model.includes('qwen')) return (input * 0.60 + output * 3.00) / 1_000_000
  return (input * 0.075 + output * 0.30) / 1_000_000
}

type GroqChatResponse = {
  error?: { message?: string; failed_generation?: string }
  usage?: Usage
  choices?: Array<{ finish_reason?: string; message?: { content?: string } }>
} | null

function groqErrorMessage(json: GroqChatResponse, status: number) {
  return String(json?.error?.message || `Groq HTTP ${status}`)
}

type OpenAiStyleMessage = { role: string; content: unknown }

// Converte mensagens no formato OpenAI/Groq (texto + image_url com data URI) para a Anthropic.
export function toClaudeRequest(messages: unknown[]) {
  const system: string[] = []
  const out: Array<{ role: 'user' | 'assistant'; content: ClaudeContentBlock[] }> = []
  for (const raw of messages as OpenAiStyleMessage[]) {
    const role = raw?.role
    const parts: ClaudeContentBlock[] = []
    if (typeof raw?.content === 'string') {
      if (raw.content.trim()) parts.push({ type: 'text', text: raw.content })
    } else if (Array.isArray(raw?.content)) {
      for (const part of raw.content as Array<Record<string, unknown>>) {
        if (part?.type === 'text' && typeof part.text === 'string' && part.text.trim()) parts.push({ type: 'text', text: part.text })
        if (part?.type === 'image_url') {
          const url = typeof part.image_url === 'object' && part.image_url ? String((part.image_url as { url?: unknown }).url || '') : ''
          const block = imageBlockFromDataUri(url)
          if (block) parts.push(block)
        }
      }
    }
    if (!parts.length) continue
    if (role === 'system') {
      system.push(parts.filter((part) => part.type === 'text').map((part) => (part as { text: string }).text).join('\n'))
      continue
    }
    const claudeRole = role === 'assistant' ? 'assistant' : 'user'
    const last = out[out.length - 1]
    if (last && last.role === claudeRole) last.content.push(...parts)
    else out.push({ role: claudeRole, content: parts })
  }
  return { system: system.join('\n\n'), messages: out }
}

async function claudeJson<T>(input: { storeId: string; waId?: string; operation: string; messages: unknown[]; maxTokens?: number }): Promise<T> {
  const converted = toClaudeRequest(input.messages)
  const response = await claudeMessages({
    storeId: input.storeId,
    waId: input.waId,
    operation: input.operation,
    system: [
      { text: 'Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois e sem cercas de código.' },
      { text: converted.system },
    ],
    messages: converted.messages,
    maxTokens: Math.min(Math.max(input.maxTokens || 2000, 1024), 16_000),
    temperature: 0,
  })
  const text = claudeText(response)
  const parsed = parseModelJson<T>(text)
  if (!parsed) {
    await recordAiError({
      storeId: input.storeId,
      waId: input.waId,
      operation: input.operation,
      model: claudeModel(),
      stage: response.stop_reason === 'max_tokens' ? 'truncated' : 'parse',
      message: `stop_reason=${response.stop_reason ?? 'n/a'}`,
      raw: text,
    })
    throw new Error('claude_invalid_json')
  }
  return parsed
}

async function groqJson<T>(input: {
  storeId: string
  waId?: string
  operation: string
  model: string
  messages: unknown[]
  maxTokens?: number
}): Promise<T> {
  const budget = await rafaAiBudgetAvailable(input.storeId)
  if (!budget.allowed) throw new Error('rafa_ai_budget_exceeded')

  // Com a chave da Anthropic, TODA extração em JSON (ações, imagem, nota, nome→EAN) vai para o Claude.
  // A Groq fica como reserva se a Anthropic falhar.
  if (claudeEnabled()) {
    try {
      return await claudeJson<T>(input)
    } catch (error) {
      console.error('Claude JSON failed, falling back to Groq', input.operation, error instanceof Error ? error.message : error)
    }
  }

  // Qwen "pensa" antes de responder e queimava o limite de tokens nisso (6.000 tokens por foto).
  // Em extração de JSON pedimos modo instrução (reasoning_effort: none).
  const isQwen = input.model.includes('qwen')
  const call = (reasoningOff: boolean) => fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      temperature: 0,
      max_completion_tokens: input.maxTokens || 1800,
      response_format: { type: 'json_object' },
      ...(reasoningOff ? { reasoning_effort: 'none' } : {}),
      stream: false,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(60_000),
  })
  const errorContext = { storeId: input.storeId, waId: input.waId, operation: input.operation, model: input.model }

  let response: Response
  let json: GroqChatResponse
  try {
    response = await call(isQwen)
    json = await response.json().catch(() => null) as GroqChatResponse
    // Só volta a ligar o raciocínio se a API recusar especificamente o parâmetro.
    if (isQwen && response.status === 400 && /reasoning/i.test(groqErrorMessage(json, 400))) {
      await recordAiError({ ...errorContext, stage: 'http', httpStatus: 400, message: `reasoning_effort recusado: ${groqErrorMessage(json, 400)}` })
      response = await call(false)
      json = await response.json().catch(() => null) as GroqChatResponse
    }
  } catch (error) {
    await recordAiError({ ...errorContext, stage: 'exception', message: error instanceof Error ? error.message : String(error) })
    throw error
  }

  if (!response.ok) {
    // json_validate_failed: a Groq devolve o texto gerado em error.failed_generation.
    // Se ele tiver um JSON aproveitável, usamos em vez de desistir.
    const failed = typeof json?.error?.failed_generation === 'string' ? json.error.failed_generation : null
    await recordAiError({
      ...errorContext,
      stage: 'http',
      httpStatus: response.status,
      message: groqErrorMessage(json, response.status),
      raw: failed ?? (json ? JSON.stringify(json) : null),
    })
    const salvaged = failed ? parseModelJson<T>(failed) : null
    if (salvaged) return salvaged
    throw new Error(groqErrorMessage(json, response.status))
  }

  const usage = (json?.usage || {}) as Usage
  await recordAiUsage({
    storeId: input.storeId,
    waId: input.waId,
    operation: input.operation,
    model: input.model,
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    estimatedCostUsd: tokenCost(input.model, usage),
  })

  const choice = json?.choices?.[0]
  const text = choice?.message?.content
  if (typeof text !== 'string' || !text.trim()) {
    await recordAiError({ ...errorContext, stage: 'empty', message: `finish_reason=${choice?.finish_reason ?? 'n/a'}`, raw: JSON.stringify(choice ?? json).slice(0, 20_000) })
    throw new Error('groq_empty_json')
  }
  const parsed = parseModelJson<T>(text)
  if (!parsed) {
    await recordAiError({
      ...errorContext,
      stage: choice?.finish_reason === 'length' ? 'truncated' : 'parse',
      message: `finish_reason=${choice?.finish_reason ?? 'n/a'} output_tokens=${usage.completion_tokens ?? 'n/a'}`,
      raw: text,
    })
    throw new Error('groq_invalid_json')
  }
  return parsed
}

export type RafaExtractedAction = {
  tipo: 'preco' | 'estoque' | 'venda' | 'entrada'
  referencia_produto: string
  valor_novo_centavos?: number
  estoque_novo_milli?: number
  quantidade_milli?: number
  custo_unitario_centavos?: number
  forma_pagamento?: 'pix' | 'card' | 'cash'
  motivo?: string
}

export async function extractRafaActions(input: {
  storeId: string
  waId: string
  text: string
  intent: string
  products: Array<{ id: string; name: string; barcode: string; priceCents: number; stockMilli: number; averageCostCents?: number }>
  history: Array<{ role: 'user' | 'assistant'; text: string }>
}) {
  const productContext = input.products.slice(0, 250).map((product) => ({
    id: product.id,
    nome: product.name,
    ean: product.barcode,
    preco_centavos: product.priceCents,
    estoque_milli: product.stockMilli,
    custo_centavos: Math.round(product.averageCostCents || 0),
  }))

  return groqJson<{ actions: RafaExtractedAction[] }>({
    storeId: input.storeId,
    waId: input.waId,
    operation: 'text_action_extraction',
    model: RAFA_TEXT_MODEL,
    maxTokens: 1400,
    messages: [
      {
        role: 'system',
        content: [
          'Você é um extrator determinístico de comandos operacionais do Balcão.',
          'Não converse. Retorne somente JSON.',
          'Extraia apenas ações coerentes com o intent já classificado.',
          'Nunca invente produto, quantidade, preço ou custo.',
          'Pode haver várias alterações na mesma mensagem.',
          'Preço e custo sempre em centavos inteiros. Quantidade e estoque sempre em milli-unidades: 1 unidade = 1000.',
          'Se faltar dado essencial, retorne actions vazio.',
          'Não inclua assuntos fora da operação.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          intent: input.intent,
          mensagem: input.text,
          historico_recente: input.history.slice(-10),
          produtos_da_loja: productContext,
          schema: {
            actions: [{
              tipo: 'preco|estoque|venda|entrada',
              referencia_produto: 'texto usado pelo lojista',
              valor_novo_centavos: 'integer opcional',
              estoque_novo_milli: 'integer opcional',
              quantidade_milli: 'integer opcional',
              custo_unitario_centavos: 'integer opcional',
              forma_pagamento: 'pix|card|cash opcional',
              motivo: 'string opcional',
            }],
          },
        }),
      },
    ],
  })
}

export type RafaMediaClass =
  | 'nota_fiscal'
  | 'caderno_anotacao'
  | 'planilha_print'
  | 'print_sistema'
  | 'foto_produto'
  | 'foto_prateleira'
  | 'outro'

export async function classifyRafaImage(input: {
  storeId: string
  waId: string
  dataUri: string
}) {
  return groqJson<{ classe: RafaMediaClass; descricao: string; fornecedor_nome?: string | null }>({
    storeId: input.storeId,
    waId: input.waId,
    operation: 'image_classification',
    model: RAFA_VISION_MODEL,
    maxTokens: 300,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Classifique esta imagem em exatamente uma classe: nota_fiscal, caderno_anotacao, planilha_print, print_sistema, foto_produto, foto_prateleira, outro. Retorne JSON com classe, descricao curta em português e fornecedor_nome se claramente visível. Não extraia itens nem faça OCR detalhado.',
        },
        { type: 'image_url', image_url: { url: input.dataUri } },
      ],
    }],
  })
}

export type RafaImageReading = {
  classe: RafaMediaClass
  descricao: string
  fornecedor_nome?: string | null
  texto?: string | null
  itens?: Array<{
    nome?: string | null
    ean?: string | null
    quantidade?: number | null
    unidade?: string | null
    preco_reais?: number | null
    custo_reais?: number | null
    observacao?: string | null
  }> | null
}

// Lê qualquer imagem: diz o que é e tira o conteúdo útil (texto e itens), para a Rafa agir em cima.
export async function readRafaImage(input: {
  storeId: string
  waId: string
  dataUri: string
  caption?: string | null
}) {
  return groqJson<RafaImageReading>({
    storeId: input.storeId,
    waId: input.waId,
    operation: 'image_reading',
    model: RAFA_VISION_MODEL,
    maxTokens: 3000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            'Você lê imagens mandadas por um pequeno comerciante brasileiro no WhatsApp. Retorne somente JSON.',
            'classe: exatamente uma de nota_fiscal, caderno_anotacao, planilha_print, print_sistema, foto_produto, foto_prateleira, outro.',
            'descricao: uma frase curta em português dizendo o que é a imagem.',
            'fornecedor_nome: se for nota ou pedido e o fornecedor estiver claro; senão null.',
            'Se classe for nota_fiscal: texto null e itens null (a leitura linha a linha é feita depois, só se o lojista confirmar); só preencha fornecedor_nome.',
            'texto: transcreva o texto útil visível (listas, anotações à mão, etiquetas de preço, recibos), linha por linha, no máximo 60 linhas. null se não houver.',
            'itens: se houver produtos, liste cada um com nome, ean (só se o código estiver legível), quantidade, unidade, preco_reais, custo_reais e observacao. Use null no que não estiver visível. Não invente.',
            'Anotação à mão ambígua: copie como está e explique a dúvida em observacao.',
            input.caption ? `Legenda que o lojista mandou junto: "${String(input.caption).slice(0, 300)}".` : '',
          ].filter(Boolean).join(' '),
        },
        { type: 'image_url', image_url: { url: input.dataUri } },
      ],
    }],
  })
}

export type RafaInvoiceExtraction = InvoiceExtraction

// Molde compacto (chaves curtas) = menos tokens de saída = nota mais barata e mais rápida.
// normalizeInvoiceExtraction aceita também chaves longas, "itens", "lines" etc.
const INVOICE_JSON_SHAPE = '{"f":"nome do emitente","cnpj":"CNPJ do emitente só dígitos","tot":52036,"n":28,"i":[{"d":"descrição como está na nota","sc":"código do item","e":"código de barras ou null","q":1,"u":"UN","vu":2990,"vt":2990,"cp":0.95,"cq":0.95,"cc":0.95}]}'

const INVOICE_IMAGE_RULES = [
  'Você lê fotos de nota fiscal brasileira (NF-e, NFC-e, DANFE, cupom) e retorna SOMENTE JSON, sem texto fora do JSON.',
  `Formato exato: ${INVOICE_JSON_SHAPE}`,
  'f e cnpj: dados do EMITENTE (quem vendeu), no topo da nota. Confira cada dígito do CNPJ.',
  'tot: valor TOTAL impresso no rodapé, em centavos inteiros. n: quantidade total de itens/linhas impressa, se houver; senão null.',
  'i: UMA entrada para CADA linha de produto da nota, na ordem, sem pular nenhuma. Se a nota informa a quantidade total de itens, a lista deve ter esse número de entradas.',
  'd: descrição exatamente como impressa. sc: código do item. e: só se o código tiver 8, 12, 13 ou 14 dígitos (código de barras); senão null.',
  'dc: só quando a descrição tem erro óbvio de digitação ou leitura numa MARCA conhecida (ex.: "CODA COLA" → "COCA COLA", "TICO JAGU" → "TIO JOAO", "NESCAL" → "NESCAU"), escreva a descrição com a marca corrigida; senão não mande dc.',
  'q: quantidade (número; use ponto decimal, ex.: 0.528). u: unidade (UN, KG, CX, DZ...).',
  'vu: valor unitário em CENTAVOS inteiros (R$ 29,90 = 2990). vt: valor total da linha em CENTAVOS inteiros.',
  'cp, cq, cc: confiança de 0 a 1 em produto, quantidade e custo, avaliadas separadamente.',
  'Campo ilegível: null. Nunca invente.',
].join('\n')

async function extractInvoiceBatch(input: {
  storeId: string
  waId: string
  dataUris: string[]
  operation?: string
  tiled?: boolean
  recheckMessage?: string
}) {
  const images = input.dataUris.map((url) => ({ type: 'image_url', image_url: { url } }))
  const notes = [
    input.tiled ? 'As imagens são faixas da MESMA nota, em ordem de cima para baixo, com sobreposição. Linhas repetidas na sobreposição aparecem UMA vez só.' : '',
    input.recheckMessage || '',
  ].filter(Boolean).join('\n')
  const raw = await groqJson<unknown>({
    storeId: input.storeId,
    waId: input.waId,
    operation: input.operation || 'invoice_extraction',
    model: RAFA_VISION_MODEL,
    maxTokens: 12000,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: `${INVOICE_IMAGE_RULES}\n${notes}\nLeia todas as imagens recebidas como uma única nota quando forem continuação.` },
        ...images,
      ],
    }],
  })
  return normalizeInvoiceExtraction(raw)
}

export async function extractRafaInvoiceImages(input: {
  storeId: string
  waId: string
  dataUris: string[]
  operation?: string
  tiled?: boolean
  recheckMessage?: string
}): Promise<RafaInvoiceExtraction> {
  const parts: InvoiceExtraction[] = []
  for (const batch of chunk(input.dataUris.slice(0, 9), VISION_MAX_IMAGES)) {
    const part = await extractInvoiceBatch({
      storeId: input.storeId,
      waId: input.waId,
      dataUris: batch,
      operation: input.operation,
      tiled: input.tiled,
      recheckMessage: input.recheckMessage,
    })
    if (!part.items.length) {
      await recordAiError({ storeId: input.storeId, waId: input.waId, operation: input.operation || 'invoice_extraction', model: RAFA_VISION_MODEL, stage: 'empty', message: 'extração sem itens' })
    }
    parts.push(part)
  }
  return mergeInvoiceExtractions(parts)
}

// Nome da nota → código de barras: a IA só ESCOLHE entre candidatos reais do catálogo (nunca inventa).
export type NameEanChoice = { n: number; ean: string | null; nome?: string | null; falta?: string | null }

export async function chooseEanByName(input: {
  storeId: string
  waId: string
  items: Array<{ n: number; descricao: string; marca_detectada?: string | null; candidatos: Array<{ ean: string; nome: string; marca?: string; tamanho?: string }> }>
}) {
  if (!input.items.length) return [] as NameEanChoice[]
  const result = await groqJson<{ itens?: NameEanChoice[] }>({
    storeId: input.storeId,
    waId: input.waId,
    operation: 'invoice_name_ean',
    model: RAFA_TEXT_MODEL,
    maxTokens: 6000,
    messages: [{
      role: 'user',
      content: [
        'Você identifica produtos de mercado brasileiro a partir da descrição abreviada de uma nota fiscal.',
        'Para cada item, escolha o código de barras (ean) SOMENTE entre os candidatos listados, e só quando a descrição deixa claro qual é: a marca bate E o tamanho/variante bate (ex.: "REFRIG COCA PET 2L" = Coca-Cola PET 2L; "COCA LT 350" = lata 350ml).',
        'Abreviações comuns: REFRIG=refrigerante, LT=lata, PET=garrafa, CX=caixa, FD=fardo, PCT=pacote, UN=unidade, TP1=tipo 1, INTEG=integral, DESN=desnatado, ZERO/DIET, C/12=com 12.',
        'Cada item traz marca_detectada quando a marca já foi reconhecida na descrição. Se marca_detectada não for null, é PROIBIDO responder falta "marca" ou "sem_marca".',
        'Quando não der para escolher, falta só pode ser "tamanho", "nao_encontrado" ou "sem_marca"; "sem_marca" somente quando marca_detectada é null.',
        'Palavras de embalagem ou marketing não mudam o produto (Pote, Pacote, Sachê, Garrafa, PET, Vita, "Leve mais"): se marca, tipo, variante (sabor, com/sem sal, integral, neutro, zero...) e tamanho batem, ESCOLHA. TRAD/tradicional = a versão padrão. Se a variante for outra (Ypê Neutro x Ypê Clear, Coca Zero x Original), NÃO escolha.',
        'Nunca invente código. nome = nome completo do produto escolhido (marca, tipo, tamanho).',
        'Responda só JSON: {"itens":[{"n":0,"ean":"7894900018448","nome":"Refrigerante Coca-Cola PET 2L"},{"n":1,"ean":null,"falta":"nao_encontrado"}]}',
        '',
        JSON.stringify(input.items),
      ].join('\n'),
    }],
  })
  return Array.isArray(result?.itens) ? result.itens : []
}

// Palpite de código de barras pelo nome (conhecimento do modelo). NUNCA é usado direto:
// cada código é conferido numa base de produtos (resolveUniversalProduct) antes de valer.
export type EanGuess = { n: number; opcoes?: Array<{ ean: string; nome?: string }>; eans?: string[] }
export async function guessEansByName(input: { storeId: string; waId: string; items: Array<{ n: number; descricao: string }> }) {
  if (!input.items.length) return [] as EanGuess[]
  const result = await groqJson<{ itens?: EanGuess[] }>({
    storeId: input.storeId,
    waId: input.waId,
    operation: 'invoice_name_ean_guess',
    model: RAFA_TEXT_MODEL,
    maxTokens: 6000,
    messages: [{
      role: 'user',
      content: [
        'Você conhece os códigos de barras (EAN-13/GTIN) de produtos vendidos em mercados do Brasil.',
        'Para cada descrição abreviada de nota fiscal abaixo, liste até 3 códigos EAN que você acredita serem desse produto EXATO (mesma marca, tipo e tamanho), cada um com o nome completo do produto (marca, tipo, tamanho). Brasil começa com 789 ou 790.',
        'Se não souber, devolva lista vazia. Os códigos serão conferidos numa base real antes de usar, então prefira acertar a marca e o tamanho.',
        'Abreviações: REFRIG=refrigerante, PET=garrafa, LT=lata, ACHOC=achocolatado, BISC=biscoito, CR DENTAL=creme dental, PAPEL HIG=papel higiênico, FD=fardo, T1=tipo 1, TRAD=tradicional, C/SAL=com sal.',
        'Responda só JSON: {"itens":[{"n":0,"opcoes":[{"ean":"7894900027013","nome":"Refrigerante Coca-Cola Original Garrafa PET 2L"}]},{"n":1,"opcoes":[]}]}',
        '',
        JSON.stringify(input.items),
      ].join('\n'),
    }],
  })
  return Array.isArray(result?.itens) ? result.itens : []
}

// Nota em PDF (DANFE com texto) ou XML: mesma extração, lendo o texto em vez da foto.
export async function extractRafaInvoiceText(input: {
  storeId: string
  waId: string
  text: string
}) {
  const raw = await groqJson<unknown>({
    storeId: input.storeId,
    waId: input.waId,
    operation: 'invoice_extraction_text',
    model: RAFA_TEXT_MODEL,
    maxTokens: 6000,
    messages: [{
      role: 'user',
      content: [
        'Extraia a nota fiscal abaixo (texto de DANFE ou XML de NF-e) e retorne somente JSON no formato:',
        '{"supplier_name":..., "supplier_cnpj":..., "printed_total_cents":..., "printed_item_count":..., "items":[{"description","supplier_code","ean","quantity","unit_cost_cents","total_cents","unit_package","confidence":{"product","quantity","cost"}}]}.',
        'No XML: emit/xNome e emit/CNPJ; cada det/prod: xProd, cProd, cEAN (ignore "SEM GTIN"), qCom, vUnCom, vProd, uCom.',
        'Não invente campos ausentes; use null. Valores monetários em centavos inteiros. confidence entre 0 e 1.',
        '',
        input.text.slice(0, 30_000),
      ].join('\n'),
    }],
  })
  return normalizeInvoiceExtraction(raw)
}

export async function transcribeRafaAudio(input: {
  storeId: string
  waId: string
  bytes: Uint8Array
  mime: string
  filename: string
}) {
  const budget = await rafaAiBudgetAvailable(input.storeId)
  if (!budget.allowed) throw new Error('rafa_ai_budget_exceeded')

  const form = new FormData()
  form.append('model', RAFA_AUDIO_MODEL)
  form.append('language', 'pt')
  form.append('temperature', '0')
  form.append('response_format', 'verbose_json')
  const audioBuffer = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer
  // A Groq decide o formato pela extensão: "ID.oga" (nome dado pela Evolution) era recusado.
  const filename = groqAudioFilename(input.mime, input.filename)
  form.append('file', new Blob([audioBuffer], { type: groqAudioMime(input.mime, input.filename) }), filename)
  const errorContext = { storeId: input.storeId, waId: input.waId, operation: 'audio_transcription', model: RAFA_AUDIO_MODEL }

  let response: Response
  try {
    response = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey()}` },
      body: form,
      cache: 'no-store',
      signal: AbortSignal.timeout(35_000),
    })
  } catch (error) {
    await recordAiError({ ...errorContext, stage: 'exception', message: `${filename} (${input.bytes.byteLength} bytes): ${error instanceof Error ? error.message : String(error)}` })
    throw error
  }
  const json = await response.json().catch(() => null) as any
  if (!response.ok) {
    await recordAiError({
      ...errorContext,
      stage: 'http',
      httpStatus: response.status,
      message: `${filename} (${input.mime}, ${input.bytes.byteLength} bytes): ${groqErrorMessage(json, response.status)}`,
      raw: json ? JSON.stringify(json) : null,
    })
    throw new Error(groqErrorMessage(json, response.status))
  }

  const duration = Math.max(0, Number(json?.duration || 0))
  await recordAiUsage({
    storeId: input.storeId,
    waId: input.waId,
    operation: 'audio_transcription',
    model: RAFA_AUDIO_MODEL,
    audioSeconds: duration,
    estimatedCostUsd: duration * 0.04 / 3600,
  })
  return {
    text: typeof json?.text === 'string' ? json.text.trim() : '',
    durationSeconds: duration,
  }
}
