import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sheetConfigFromEnv, syncSubscribers, type NewsletterSubscriber, type SyncResult } from './sheets-core'
import { postToSheetWebhook, sheetWebhookConfigured } from './sheet-webhook'

type SubscriberRow = { id: string; email: string; name: string | null; source: string | null; created_at: string }

function toSubscriber(row: SubscriberRow): NewsletterSubscriber {
  return { id: row.id, email: row.email, name: row.name, source: row.source, createdAt: row.created_at }
}

/** Recuperação Supabase → Sheets só da lista da newsletter (site_newsletter). Idempotente: só adiciona quem falta. */
export async function syncAllNewsletterSubscribersToSheet(): Promise<SyncResult & { subscribers: number; via: string }> {
  const cfg = sheetConfigFromEnv()
  const useWebhook = sheetWebhookConfigured()
  if (!cfg && !useWebhook) throw new Error('missing_sheet_webhook_or_google_credentials')

  const supabase = createAdminClient()
  const all: SubscriberRow[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('rpg_newsletter_subscribers')
      .select('id, email, name, source, created_at')
      .eq('source', 'site_newsletter')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`supabase_read_failed ${error.code ?? ''}`.trim())
    all.push(...((data ?? []) as SubscriberRow[]))
    if (!data || data.length < pageSize) break
  }

  if (useWebhook) {
    const items = all.map((row) => ({ id: row.id, email: row.email, name: row.name, createdAt: row.created_at }))
    const result = await postToSheetWebhook({ items, mode: 'missing-only' }, 50_000)
    if (!result.ok) throw new Error(`sheet_webhook_failed ${result.error ?? ''}`.trim())
    return { added: result.added ?? 0, updated: 0, existing: result.existing ?? 0, duplicatesInSheet: 0, subscribers: all.length, via: 'webhook' }
  }

  const result = await syncSubscribers({ ...cfg!, timeoutMs: 20_000 }, all.map(toSubscriber), 'missing-only')
  return { ...result, subscribers: all.length, via: 'service_account' }
}
