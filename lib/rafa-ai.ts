import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
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

function budgetUsd() {
  const value = Number(process.env.RAFA_AI_DAILY_BUDGET_USD || '0.10')
  return Number.isFinite(value) && value > 0 ? value : 0.10
}

function saoPauloDayStartUtc(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]))
  return new Date(`${parts.year}-${parts.month}-${parts.day}T03:00:00.000Z`).toISOString()
}

export async function rafaAiBudgetAvailable(storeId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ai_usage')
    .select('estimated_cost_usd')
    .eq('store_id', storeId)
    .gte('created_at', saoPauloDayStartUtc())
  if (error) throw error
  const spent = (data || []).reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0)
  return { allowed: spent < budgetUsd(), spent, limit: budgetUsd() }
}

export async function recordAiUsage(input: {
  storeId: string
  waId?: string | null
  operation: string
  model: string
  inputTokens?: number
  outputTokens?: number
  audioSeconds?: number
  estimatedCostUsd: number
}) {
  const admin = createAdminClient()
  const { error } = await admin.from('ai_usage').insert({
    store_id: input.storeId,
    wa_id: input.waId || null,
    operation: input.operation,
    model: input.model,
    input_tokens: Math.max(0, Math.round(input.inputTokens || 0)),
    output_tokens: Math.max(0, Math.round(input.outputTokens || 0)),
    audio_seconds: Math.max(0, Number(input.audioSeconds || 0)),
    estimated_cost_usd: Math.max(0, input.estimatedCostUsd),
  })
  if (error) throw error
}

// Preços Groq em US$ por 1M tokens (entrada / saída).
function tokenCost(model: string, usage: Usage) {
  const input = Number(usage.prompt_tokens || 0)
  const output = Number(usage.completion_tokens || 0)
  if (model.includes('qwen3.8')) return (input * 0.80 + output * 4.00) / 1_000_000
  if (model.includes('qwen')) return (input * 0.60 + output * 3.00) / 1_000_000
  return (input * 0.075 + output * 0.30) / 1_000_000
}

// Toda falha de IA vira uma linha em rafa_ai_errors (a Vercel Hobby só guarda 1h de log).
// Nunca lança: registrar erro não pode derrubar o atendimento.
export async function recordAiError(input: {
  storeId?: string | null
  waId?: string | null
  operation: string
  model: string
  stage: 'http' | 'truncated' | 'parse' | 'empty' | 'exception'
  httpStatus?: number | null
  message?: string | null
  raw?: string | null
}) {
  try {
    const admin = createAdminClient()
    await admin.from('rafa_ai_errors').insert({
      store_id: input.storeId || null,
      wa_id: input.waId || null,
      operation: input.operation,
      model: input.model,
      stage: input.stage,
      http_status: input.httpStatus ?? null,
      error_message: input.message ? String(input.message).slice(0, 2000) : null,
      raw_response: input.raw ? String(input.raw).slice(0, 20_000) : null,
    })
  } catch (error) {
    console.error('rafa_ai_errors insert failed', error instanceof Error ? error.message : error)
  }
}

type GroqChatResponse = {
  error?: { message?: string; failed_generation?: string }
  usage?: Usage
  choices?: Array<{ finish_reason?: string; message?: { content?: string } }>
} | null

function groqErrorMessage(json: GroqChatResponse, status: number) {
  return String(json?.error?.message || `Groq HTTP ${status}`)
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
const INVOICE_JSON_SHAPE = '{"f":"nome do emitente","cnpj":"CNPJ do emitente só dígitos","i":[{"d":"descrição como está na nota","sc":"código do item","e":"código de barras ou null","q":1,"u":"UN","vu":2990,"vt":2990,"cp":0.95,"cq":0.95,"cc":0.95}]}'

const INVOICE_IMAGE_RULES = [
  'Você lê fotos de nota fiscal brasileira (NF-e, NFC-e, DANFE, cupom) e retorna SOMENTE JSON, sem texto fora do JSON.',
  `Formato exato: ${INVOICE_JSON_SHAPE}`,
  'f e cnpj: dados do EMITENTE (quem vendeu), no topo da nota. Confira cada dígito do CNPJ.',
  'i: UMA entrada para CADA linha de produto da nota, na ordem, sem pular nenhuma. Se a nota informa a quantidade total de itens, a lista deve ter esse número de entradas.',
  'd: descrição exatamente como impressa. sc: código do item. e: só se o código tiver 8, 12, 13 ou 14 dígitos (código de barras); senão null.',
  'q: quantidade (número; use ponto decimal, ex.: 0.528). u: unidade (UN, KG, CX, DZ...).',
  'vu: valor unitário em CENTAVOS inteiros (R$ 29,90 = 2990). vt: valor total da linha em CENTAVOS inteiros.',
  'cp, cq, cc: confiança de 0 a 1 em produto, quantidade e custo, avaliadas separadamente.',
  'Campo ilegível: null. Nunca invente.',
].join('\n')

async function extractInvoiceBatch(input: { storeId: string; waId: string; dataUris: string[]; retry: boolean }) {
  const images = input.dataUris.map((url) => ({ type: 'image_url', image_url: { url } }))
  const rules = input.retry
    ? `${INVOICE_IMAGE_RULES}\nATENÇÃO: a leitura anterior voltou sem nenhum item. A foto tem linhas de produtos com descrição, quantidade e valores: liste todas elas em "i".`
    : INVOICE_IMAGE_RULES
  const raw = await groqJson<unknown>({
    storeId: input.storeId,
    waId: input.waId,
    operation: input.retry ? 'invoice_extraction_retry' : 'invoice_extraction',
    model: RAFA_VISION_MODEL,
    maxTokens: 12000,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: `${rules}\nLeia todas as fotos recebidas como uma única nota quando forem continuação.` },
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
}): Promise<RafaInvoiceExtraction> {
  // Modelo aceita no máximo 3 imagens por chamada: nota com mais fotos vai em lotes e é juntada.
  const parts: InvoiceExtraction[] = []
  for (const batch of chunk(input.dataUris.slice(0, 9), VISION_MAX_IMAGES)) {
    let part = await extractInvoiceBatch({ storeId: input.storeId, waId: input.waId, dataUris: batch, retry: false })
    if (!part.items.length) {
      await recordAiError({ storeId: input.storeId, waId: input.waId, operation: 'invoice_extraction', model: RAFA_VISION_MODEL, stage: 'empty', message: 'extração sem itens; tentando de novo' })
      part = await extractInvoiceBatch({ storeId: input.storeId, waId: input.waId, dataUris: batch, retry: true })
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
  items: Array<{ n: number; descricao: string; candidatos: Array<{ ean: string; nome: string; marca?: string; tamanho?: string }> }>
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
        'Se a descrição não tem marca ("ARROZ TIPO 1 5KG") ou falta tamanho ("COCA COLA"), ou nenhum candidato bate, devolva ean null e diga em "falta" o que falta ("marca", "tamanho", "marca e tamanho" ou "não encontrado").',
        'Nunca invente código. nome = nome completo do produto escolhido (marca, tipo, tamanho).',
        'Responda só JSON: {"itens":[{"n":0,"ean":"7894900018448","nome":"Refrigerante Coca-Cola PET 2L"},{"n":1,"ean":null,"falta":"marca"}]}',
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
        '{"supplier_name":..., "supplier_cnpj":..., "items":[{"description","supplier_code","ean","quantity","unit_cost_cents","total_cents","unit_package","confidence":{"product","quantity","cost"}}]}.',
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
