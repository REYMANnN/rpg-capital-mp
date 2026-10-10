import 'server-only'

/**
 * Webhook da planilha da newsletter (Google Apps Script publicado como App da Web).
 * Só roda no servidor (nunca no bundle público). Segredo opcional via NEWSLETTER_SHEET_WEBHOOK_SECRET.
 * Código do script: scripts/newsletter-sheet-webhook.gs
 */
export type SheetWebhookItem = {
  id?: string | null
  email: string
  name?: string | null
  company?: string | null
  city?: string | null
  createdAt?: string | null
}

export type SheetWebhookResult = {
  ok: boolean
  added?: number
  updated?: number
  existing?: number
  found?: boolean
  error?: string
}

type WebhookPayload =
  | { items: SheetWebhookItem[]; mode: 'upsert' | 'missing-only' }
  | { action: 'unsubscribe'; email: string; reason?: string | null }

/** App da Web publicado a partir de scripts/newsletter-sheet-webhook.gs (pode ser trocado por env). */
const DEFAULT_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbz7Nbf7TuAeb-MIVP4zW5t7AR77QNVOgiCRwSuxy1KHU6XmeWAiF2F7rPxugGxgmciE/exec'

function webhookUrl(): string {
  return process.env.NEWSLETTER_SHEET_WEBHOOK_URL?.trim() || DEFAULT_WEBHOOK_URL
}

export function sheetWebhookConfigured(): boolean {
  return Boolean(webhookUrl())
}

export async function postToSheetWebhook(
  payload: WebhookPayload,
  timeoutMs = 10_000,
): Promise<SheetWebhookResult> {
  const url = webhookUrl()
  const secret = process.env.NEWSLETTER_SHEET_WEBHOOK_SECRET?.trim() || undefined

  // Apps Script responde 302 -> googleusercontent; o fetch segue o redirect sozinho.
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, ...payload }),
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })
  const json = (await response.json().catch(() => null)) as SheetWebhookResult | null
  if (!response.ok || !json) return { ok: false, error: `http_${response.status}` }
  return json
}

/** Cadastro do site direto na planilha. Nunca lança erro. */
export async function sendSignupToSheet(item: SheetWebhookItem): Promise<boolean> {
  try {
    const result = await postToSheetWebhook({ items: [item], mode: 'upsert' })
    if (!result.ok) {
      console.error('newsletter_sheet_webhook_failed', { error: result.error })
      return false
    }
    console.info('newsletter_sheet_webhook_ok', { added: result.added, updated: result.updated })
    return true
  } catch (error) {
    console.error('newsletter_sheet_webhook_failed', { error: error instanceof Error ? error.message : String(error) })
    return false
  }
}

/** Descadastro (página /newsletter/sair): Descadastrado=SIM, data e motivo na planilha. */
export async function unsubscribeFromSheet(email: string, reason: string | null): Promise<boolean> {
  try {
    const result = await postToSheetWebhook({ action: 'unsubscribe', email, reason })
    if (!result.ok) {
      console.error('newsletter_unsubscribe_failed', { error: result.error })
      return false
    }
    console.info('newsletter_unsubscribe_ok', { found: result.found })
    return true
  } catch (error) {
    console.error('newsletter_unsubscribe_failed', { error: error instanceof Error ? error.message : String(error) })
    return false
  }
}
