/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only'

import { recordAiError, recordAiUsage } from '@/lib/rafa-ai-usage'

// Cliente mínimo da API da Anthropic (Messages). Sem SDK: fetch direto, com cache de prompt,
// uma nova tentativa em sobrecarga e registro de custo em ai_usage.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

export function claudeModel() {
  return process.env.RAFA_AGENT_MODEL?.trim() || 'claude-sonnet-5-5'
}

// Liga a Anthropic em todas as chamadas de IA quando a chave existe.
// RAFA_LLM=groq força o caminho antigo (Groq) sem precisar tirar a chave.
export function claudeEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim()) && process.env.RAFA_LLM?.trim().toLowerCase() !== 'groq'
}

function key() {
  const value = process.env.ANTHROPIC_API_KEY?.trim()
  if (!value) throw new Error('ANTHROPIC_API_KEY is not configured')
  return value
}

// US$ por 1M tokens. Padrão = Sonnet 5.5; sobrescreva por env ao trocar de modelo.
function prices() {
  const num = (name: string, fallback: number) => {
    const value = Number(process.env[name])
    return Number.isFinite(value) && value >= 0 ? value : fallback
  }
  return {
    input: num('RAFA_LLM_PRICE_INPUT', 2),
    output: num('RAFA_LLM_PRICE_OUTPUT', 10),
    cacheRead: num('RAFA_LLM_PRICE_CACHE_READ', 0.2),
    cacheWrite: num('RAFA_LLM_PRICE_CACHE_WRITE', 2.5),
  }
}

export type ClaudeUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export function claudeCostUsd(usage: ClaudeUsage) {
  const p = prices()
  return (
    Number(usage.input_tokens || 0) * p.input
    + Number(usage.output_tokens || 0) * p.output
    + Number(usage.cache_read_input_tokens || 0) * p.cacheRead
    + Number(usage.cache_creation_input_tokens || 0) * p.cacheWrite
  ) / 1_000_000
}

export type ClaudeContentBlock =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: string | Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>; is_error?: boolean }

export type ClaudeMessage = { role: 'user' | 'assistant'; content: string | ClaudeContentBlock[] }

export type ClaudeTool = { name: string; description: string; input_schema: Record<string, unknown> }

export type ClaudeResponse = {
  content: ClaudeContentBlock[]
  stop_reason: string | null
  usage: ClaudeUsage
}

// data:image/jpeg;base64,xxxx → bloco de imagem da Anthropic.
export function imageBlockFromDataUri(dataUri: string): ClaudeContentBlock | null {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUri)
  if (!match) return null
  const mediaType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1]
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType)) return null
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: match[2] } }
}

export async function claudeMessages(input: {
  storeId: string
  waId?: string | null
  operation: string
  system: Array<{ text: string; cache?: boolean }>
  messages: ClaudeMessage[]
  tools?: ClaudeTool[]
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
}): Promise<ClaudeResponse> {
  const model = claudeModel()
  const system = input.system
    .filter((block) => block.text.trim())
    .map((block) => ({ type: 'text' as const, text: block.text, ...(block.cache ? { cache_control: { type: 'ephemeral' as const } } : {}) }))
  const tools = input.tools?.length
    ? input.tools.map((tool, index) => index === input.tools!.length - 1 ? { ...tool, cache_control: { type: 'ephemeral' } } : tool)
    : undefined
  const body = JSON.stringify({
    model,
    max_tokens: input.maxTokens || 2048,
    temperature: input.temperature ?? 0.2,
    system,
    messages: input.messages,
    ...(tools ? { tools } : {}),
  })

  const call = () => fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': key(),
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(input.timeoutMs || 90_000),
  })

  const errorContext = { storeId: input.storeId, waId: input.waId, operation: input.operation, model }
  let response: Response
  let json: any
  try {
    response = await call()
    json = await response.json().catch(() => null)
    // Sobrecarga/limite: uma nova tentativa depois de 1,5 s.
    if ([429, 500, 502, 503, 529].includes(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      response = await call()
      json = await response.json().catch(() => null)
    }
  } catch (error) {
    await recordAiError({ ...errorContext, stage: 'exception', message: error instanceof Error ? error.message : String(error) })
    throw error
  }

  if (!response.ok) {
    const message = String(json?.error?.message || `Anthropic HTTP ${response.status}`)
    await recordAiError({ ...errorContext, stage: 'http', httpStatus: response.status, message, raw: json ? JSON.stringify(json).slice(0, 20_000) : null })
    throw new Error(message)
  }

  const usage = (json?.usage || {}) as ClaudeUsage
  await recordAiUsage({
    storeId: input.storeId,
    waId: input.waId,
    operation: input.operation,
    model,
    inputTokens: Number(usage.input_tokens || 0) + Number(usage.cache_read_input_tokens || 0) + Number(usage.cache_creation_input_tokens || 0),
    outputTokens: usage.output_tokens,
    estimatedCostUsd: claudeCostUsd(usage),
  }).catch(() => {})

  return {
    content: Array.isArray(json?.content) ? json.content as ClaudeContentBlock[] : [],
    stop_reason: typeof json?.stop_reason === 'string' ? json.stop_reason : null,
    usage,
  }
}

export function claudeText(response: ClaudeResponse) {
  return response.content
    .filter((block): block is Extract<ClaudeContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}
