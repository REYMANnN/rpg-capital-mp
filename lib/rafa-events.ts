import 'server-only'

import { formatRafaHistory, type RafaEventRow } from '@/lib/rafa-events-core'
import { createAdminClient } from '@/lib/supabase/admin'

export { formatRafaHistory, type RafaEventRow } from '@/lib/rafa-events-core'

// Mesmo formato do número usado no resto do WhatsApp (só dígitos). Local para evitar import circular.
function normalizePhone(value: string) {
  return String(value || '').replace(/@.*$/, '').replace(/:.*$/, '').replace(/\D/g, '')
}

// Memória de conversa: tudo que acontece com o número vira um evento (texto, áudio, foto, nota,
// ação, resposta). É o que a Rafa lê antes de responder. Gravar nunca derruba o atendimento.

export type RafaEventInput = {
  waId: string
  storeId?: string | null
  direction: 'in' | 'out' | 'system'
  kind: string
  text?: string | null
  data?: Record<string, unknown>
  mediaPath?: string | null
  sourceId?: string | null
}

export async function recordRafaEvent(input: RafaEventInput): Promise<string | null> {
  try {
    const row = {
      wa_id: normalizePhone(input.waId),
      store_id: input.storeId || null,
      direction: input.direction,
      kind: input.kind,
      text: input.text ? String(input.text).slice(0, 4000) : null,
      data: input.data || {},
      media_path: input.mediaPath || null,
      source_id: input.sourceId || null,
    }
    const { data, error } = input.sourceId
      ? await createAdminClient().from('rafa_events').upsert(row, { onConflict: 'source_id' }).select('id').maybeSingle()
      : await createAdminClient().from('rafa_events').insert(row).select('id').maybeSingle()
    if (error) throw error
    return data?.id ? String(data.id) : null
  } catch (error) {
    console.error('rafa_events insert failed', error instanceof Error ? error.message : error)
    return null
  }
}

// Completa um evento já gravado (ex.: a foto chegou e depois foi lida/descrita).
export async function updateRafaEvent(sourceId: string, patch: { text?: string | null; data?: Record<string, unknown>; mediaPath?: string | null; storeId?: string | null; kind?: string }) {
  try {
    const update: Record<string, unknown> = {}
    if (patch.text !== undefined) update.text = patch.text ? String(patch.text).slice(0, 4000) : null
    if (patch.data !== undefined) update.data = patch.data
    if (patch.mediaPath !== undefined) update.media_path = patch.mediaPath
    if (patch.storeId !== undefined) update.store_id = patch.storeId
    if (patch.kind !== undefined) update.kind = patch.kind
    if (!Object.keys(update).length) return
    await createAdminClient().from('rafa_events').update(update).eq('source_id', sourceId)
  } catch (error) {
    console.error('rafa_events update failed', error instanceof Error ? error.message : error)
  }
}

export async function recentRafaEvents(waId: string, options?: { hours?: number; limit?: number; excludeSourceId?: string | null }): Promise<RafaEventRow[]> {
  const since = new Date(Date.now() - (options?.hours ?? 48) * 3600_000).toISOString()
  let query = createAdminClient().from('rafa_events')
    .select('id,direction,kind,text,data,media_path,source_id,created_at')
    .eq('wa_id', normalizePhone(waId))
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(options?.limit ?? 60)
  if (options?.excludeSourceId) query = query.or(`source_id.is.null,source_id.neq.${options.excludeSourceId}`)
  const { data } = await query
  return ((data || []) as RafaEventRow[]).reverse()
}

export async function rafaEventById(id: string, waId: string) {
  const { data } = await createAdminClient().from('rafa_events')
    .select('id,direction,kind,text,data,media_path,source_id,created_at')
    .eq('id', id)
    .eq('wa_id', normalizePhone(waId))
    .maybeSingle()
  return data as RafaEventRow | null
}

export async function rafaHistoryBlock(waId: string, excludeSourceId?: string | null) {
  const events = await recentRafaEvents(waId, { excludeSourceId }).catch(() => [])
  return formatRafaHistory(events)
}
