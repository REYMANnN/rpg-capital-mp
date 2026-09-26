import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

const GROQ_BASE = 'https://api.groq.com/openai/v1'
export const RAFA_TEXT_MODEL = 'openai/gpt-oss-20b'
export const RAFA_VISION_MODEL = 'qwen/qwen3.6-27b'
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

function tokenCost(model: string, usage: Usage) {
  const input = Number(usage.prompt_tokens || 0)
  const output = Number(usage.completion_tokens || 0)
  if (model === RAFA_VISION_MODEL) return (input * 0.60 + output * 3.00) / 1_000_000
  return (input * 0.075 + output * 0.30) / 1_000_000
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

  const response = await fetch(`${GROQ_BASE}/chat/completions`, {
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
      stream: false,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(35_000),
  })

  const json = await response.json().catch(() => null) as any
  if (!response.ok) {
    throw new Error(json?.error?.message || `Groq HTTP ${response.status}`)
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

  const text = json?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) throw new Error('groq_empty_json')
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('groq_invalid_json')
  }
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
    maxTokens: 6000,
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

export type RafaInvoiceExtraction = {
  supplier_name?: string | null
  supplier_cnpj?: string | null
  items: Array<{
    description?: string | null
    supplier_code?: string | null
    ean?: string | null
    quantity?: number | null
    unit_cost_cents?: number | null
    total_cents?: number | null
    unit_package?: string | null
    confidence: {
      product: number
      quantity: number
      cost: number
    }
  }>
}

export async function extractRafaInvoiceImages(input: {
  storeId: string
  waId: string
  dataUris: string[]
}) {
  const images = input.dataUris.slice(0, 5).map((url) => ({ type: 'image_url', image_url: { url } }))
  return groqJson<RafaInvoiceExtraction>({
    storeId: input.storeId,
    waId: input.waId,
    operation: 'invoice_extraction',
    model: RAFA_VISION_MODEL,
    maxTokens: 5000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            'Extraia a nota fiscal fotografada e retorne somente JSON.',
            'Leia todas as páginas recebidas como uma única nota quando forem continuação.',
            'Cabeçalho: supplier_name e supplier_cnpj.',
            'Para cada linha: description, supplier_code, ean, quantity, unit_cost_cents, total_cents, unit_package.',
            'Não invente campos ausentes; use null.',
            'confidence deve ter product, quantity e cost, cada um entre 0 e 1, avaliados separadamente.',
            'Valores monetários em centavos inteiros.',
          ].join(' '),
        },
        ...images,
      ],
    }],
  })
}

// Nota em PDF (DANFE com texto) ou XML: mesma extração, lendo o texto em vez da foto.
export async function extractRafaInvoiceText(input: {
  storeId: string
  waId: string
  text: string
}) {
  return groqJson<RafaInvoiceExtraction>({
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
  form.append('file', new Blob([audioBuffer], { type: input.mime || 'audio/ogg' }), input.filename)

  const response = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey()}` },
    body: form,
    cache: 'no-store',
    signal: AbortSignal.timeout(35_000),
  })
  const json = await response.json().catch(() => null) as any
  if (!response.ok) throw new Error(json?.error?.message || `Groq HTTP ${response.status}`)

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
