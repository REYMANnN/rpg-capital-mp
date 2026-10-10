import 'server-only'

/**
 * Webhook da planilha da newsletter (Google Apps Script publicado como App da Web).
 * Só roda no servidor: URL e segredo ficam em variáveis de ambiente, nunca no bundle público.
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

export type SheetWebhookResult = { ok: boolean; added?: number; updated?: number; existing?: number; error?: string }

export function sheetWebhookConfigured(): boolean {
  return Boolean(process.env.NEWSLETTER_SHEET_WEBHOOK_URL?.trim() && process.env.NEWSLETTER_SHEET_WEBHOOK_SECRET?.trim())
}

export async function postToSheetWebhook(
  payload: { items: SheetWebhookItem[]; mode: 'upsert' | 'missing-only' },
  timeoutMs = 10_000,
): Promise<SheetWebhookResult> {
  const url = process.env.NEWSLETTER_SHEET_WEBHOOK_URL?.trim()
  const secret = process.env.NEWSLETTER_SHEET_WEBHOOK_SECRET?.trim()
  if (!url || !secret) return { ok: false, error: 'webhook_not_configured' }

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
