import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sheetConfigFromEnv, syncSubscribers, type NewsletterSubscriber, type SyncResult } from './sheets-core'

type SubscriberRow = { id: string; email: string; name: string | null; source: string | null; created_at: string }

function toSubscriber(row: SubscriberRow): NewsletterSubscriber {
  return { id: row.id, email: row.email, name: row.name, source: row.source, createdAt: row.created_at }
}

/**
 * Chamado depois que o Supabase confirmou o cadastro. Nunca lança erro:
 * se o Sheets falhar, o cadastro já está salvo e a rotina de recuperação reenvia depois.
 */
export async function syncNewsletterSignupToSheet(input: { email: string; name: string | null; source: string }): Promise<void> {
  try {
    const cfg = sheetConfigFromEnv()
    if (!cfg) {
      console.warn('newsletter_sheet_sync_skipped', { reason: 'missing_google_credentials' })
      return
    }

    // Pega id e data reais do registro (o upsert com ignoreDuplicates não devolve a linha).
    const { data } = await createAdminClient()
      .from('rpg_newsletter_subscribers')
      .select('id, email, name, source, created_at')
      .eq('email', input.email)
      .maybeSingle<SubscriberRow>()

    // Nome digitado agora vale mais que o antigo; origem é sempre a do formulário atual.
    const subscriber: NewsletterSubscriber = data
      ? { ...toSubscriber(data), name: input.name || data.name, source: input.source }
      : { email: input.email, name: input.name, source: input.source }

    const result = await syncSubscribers(cfg, [subscriber], 'upsert')
    console.info('newsletter_sheet_synced', result)
  } catch (error) {
    console.error('newsletter_sheet_sync_failed', { message: error instanceof Error ? error.message : String(error) })
  }
}

/** Recuperação Supabase → Sheets para todos os inscritos. Idempotente: só adiciona quem falta. */
export async function syncAllNewsletterSubscribersToSheet(): Promise<SyncResult & { subscribers: number }> {
  const cfg = sheetConfigFromEnv()
  if (!cfg) throw new Error('missing_google_credentials')

  const supabase = createAdminClient()
  const all: SubscriberRow[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('rpg_newsletter_subscribers')
      .select('id, email, name, source, created_at')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`supabase_read_failed ${error.code ?? ''}`.trim())
    all.push(...((data ?? []) as SubscriberRow[]))
    if (!data || data.length < pageSize) break
  }

  const result = await syncSubscribers({ ...cfg, timeoutMs: 20_000 }, all.map(toSubscriber), 'missing-only')
  return { ...result, subscribers: all.length }
}
