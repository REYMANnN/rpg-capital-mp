import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

// Orçamento, custo e falhas de IA por loja. Módulo separado para não criar import circular
// entre o cliente da Anthropic (lib/llm/claude.ts) e lib/rafa-ai.ts.

// Teto diário de IA por loja, em US$. Padrão US$ 3,00 (≈ R$ 15,60; ~200 mensagens/dia) com
// Claude Sonnet; o teto mensal real fica no workspace da Anthropic. RAFA_AI_DAILY_BUDGET_USD sobrescreve.
function budgetUsd() {
  const value = Number(process.env.RAFA_AI_DAILY_BUDGET_USD || '3.00')
  return Number.isFinite(value) && value > 0 ? value : 3.00
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
  // Tempo da chamada de IA (ms), para medir onde a Rafa demora.
  durationMs?: number
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
    ...(input.durationMs != null ? { duration_ms: Math.max(0, Math.round(input.durationMs)) } : {}),
  })
  if (error) throw error
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

