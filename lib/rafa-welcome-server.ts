import 'server-only'

import { bindRafaStore, phoneStores, type RafaPhoneStore } from '@/lib/rafa-agent'
import { createRafaPendingAction, getPendingRafaAction } from '@/lib/rafa-confirm'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendText } from '@/lib/whatsapp'
import { enqueueWhatsApp, normalizePhone } from '@/lib/whatsapp-evolution'
import {
  welcomeConfirmationMessage,
  welcomeRefusalMessage,
  welcomeStockMessage,
  welcomeStorePickMessage,
  welcomeTutorialMessage,
} from '@/lib/rafa-welcome'

export const WELCOME_STORE_PREFIX = 'welcome_store:'

type PendingRow = {
  id: string
  store_id: string
  status: string
  expires_at: string
  payload: Record<string, unknown> | null
}

function welcomeKind(pending: PendingRow | null | undefined) {
  return String(pending?.payload?.kind || '')
}

function firstName(value: string | null | undefined) {
  return String(value || '').trim().split(/\s+/)[0] || ''
}

async function inviteeFirstName(businessId: string) {
  const { data } = await createAdminClient().from('balcao_coupons')
    .select('invitee_name')
    .eq('redeemed_business_id', businessId)
    .order('redeemed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return firstName(data?.invitee_name ? String(data.invitee_name) : '')
}

async function pendingWelcome(waId: string): Promise<PendingRow | null> {
  const pending = await getPendingRafaAction(normalizePhone(waId)) as PendingRow | null
  if (!pending) return null
  if (new Date(pending.expires_at).getTime() <= Date.now()) return null
  return welcomeKind(pending).startsWith('welcome_') ? pending : null
}

async function markPending(id: string, status: 'confirmada' | 'recusada') {
  const now = new Date().toISOString()
  await createAdminClient().from('rafa_pending_actions').update({
    status,
    ...(status === 'confirmada' ? { confirmed_at: now } : {}),
  }).eq('id', id)
}

async function completeWelcome(input: {
  waId: string
  store: RafaPhoneStore
  profileName?: string | null
  pendingId?: string
}) {
  const now = new Date().toISOString()
  const admin = createAdminClient()
  const { error: welcomeError } = await admin.from('balcao_businesses').update({ rafa_welcomed_at: now, updated_at: now }).eq('id', input.store.businessId)
  if (welcomeError) throw welcomeError
  await bindRafaStore(input.waId, input.store.id)
  if (input.pendingId) await markPending(input.pendingId, 'confirmada')

  const name = firstName(input.profileName) || await inviteeFirstName(input.store.businessId) || 'tudo bem'
  const tutorial = await sendText(input.waId, welcomeTutorialMessage(name), { noMenu: true })
  if (!tutorial.ok) throw new Error(tutorial.error)
  const stock = await sendText(input.waId, welcomeStockMessage())
  if (!stock.ok) throw new Error(stock.error)
}

export async function maybeStartRafaWelcome(input: { waId: string; inReplyTo?: string; profileName?: string | null }) {
  const waId = normalizePhone(input.waId)
  const existingPending = await getPendingRafaAction(waId).catch(() => null) as PendingRow | null
  if (existingPending && new Date(existingPending.expires_at).getTime() > Date.now()) return false

  const stores = await phoneStores(waId)
  if (!stores.length) return false
  const pendingStores = stores.filter((store) => !store.rafaWelcomedAt)
  if (!pendingStores.length) return false

  if (pendingStores.length === 1) {
    const store = pendingStores[0]
    const message = welcomeConfirmationMessage(waId, store.name)
    await createRafaPendingAction({
      waId,
      storeId: store.id,
      tipo: 'outro',
      payload: {
        kind: 'welcome_confirm',
        store_id: store.id,
        business_id: store.businessId,
        store_name: store.name,
        first_name: firstName(input.profileName),
      },
      message,
    })
    const sent = await sendText(waId, message, { inReplyTo: input.inReplyTo, noMenu: true })
    if (!sent.ok) throw new Error(sent.error)
    return true
  }

  await createRafaPendingAction({
    waId,
    storeId: pendingStores[0].id,
    tipo: 'outro',
    payload: {
      kind: 'welcome_store_pick',
      stores: pendingStores.map((store) => ({ id: store.id, name: store.name, businessId: store.businessId })),
      first_name: firstName(input.profileName),
    },
    message: welcomeStorePickMessage(),
  })
  const sent = await enqueueWhatsApp({
    to: waId,
    kind: 'menu_fallback',
    payload: {
      body: welcomeStorePickMessage(),
      buttons: pendingStores.slice(0, 9).map((store) => ({ id: `${WELCOME_STORE_PREFIX}${store.id}`, title: store.name })),
    },
    inReplyTo: input.inReplyTo,
    noMenu: true,
  })
  if (!sent.ok) throw new Error(sent.error)
  return true
}

export async function confirmRafaWelcomePending(input: { waId: string; profileName?: string | null }) {
  const waId = normalizePhone(input.waId)
  const pending = await pendingWelcome(waId)
  if (!pending || welcomeKind(pending) !== 'welcome_confirm') return false
  const storeId = String(pending.payload?.store_id || pending.store_id)
  const store = (await phoneStores(waId)).find((candidate) => candidate.id === storeId && !candidate.rafaWelcomedAt)
  if (!store) {
    await createAdminClient().from('rafa_pending_actions').update({ status: 'invalidada' }).eq('id', pending.id)
    return false
  }
  await completeWelcome({
    waId,
    store,
    profileName: firstName(input.profileName) || String(pending.payload?.first_name || ''),
    pendingId: pending.id,
  })
  return true
}

export async function refuseRafaWelcomePending(waId: string) {
  const pending = await pendingWelcome(waId)
  if (!pending || welcomeKind(pending) !== 'welcome_confirm') return false
  await markPending(pending.id, 'recusada')
  const sent = await sendText(waId, welcomeRefusalMessage(), { noMenu: true })
  if (!sent.ok) throw new Error(sent.error)
  return true
}

export async function selectRafaWelcomeStore(input: { waId: string; storeId: string; profileName?: string | null }) {
  const waId = normalizePhone(input.waId)
  const pending = await pendingWelcome(waId)
  if (!pending || welcomeKind(pending) !== 'welcome_store_pick') return false

  const listed = Array.isArray(pending.payload?.stores) ? pending.payload?.stores as Array<Record<string, unknown>> : []
  if (!listed.some((store) => String(store.id) === input.storeId)) return false
  const store = (await phoneStores(waId)).find((candidate) => candidate.id === input.storeId && !candidate.rafaWelcomedAt)
  if (!store) return false

  await completeWelcome({
    waId,
    store,
    profileName: firstName(input.profileName) || String(pending.payload?.first_name || ''),
    pendingId: pending.id,
  })
  return true
}

export async function handleRafaWelcomeNumber(input: { waId: string; text: string; profileName?: string | null }) {
  const pending = await pendingWelcome(input.waId)
  if (!pending || welcomeKind(pending) !== 'welcome_store_pick') return false
  const match = input.text.trim().match(/^([1-9])$/)
  if (!match) return false
  const listed = Array.isArray(pending.payload?.stores) ? pending.payload?.stores as Array<Record<string, unknown>> : []
  const selected = listed[Number(match[1]) - 1]
  if (!selected?.id) return false
  return selectRafaWelcomeStore({ waId: input.waId, storeId: String(selected.id), profileName: input.profileName })
}
