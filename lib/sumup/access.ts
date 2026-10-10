import 'server-only'

import type { NextRequest } from 'next/server'

import { getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'
import { BALCAO_SESSION_COOKIE, verifyBalcaoSessionToken } from '@/lib/deeplink'
import { createAdminClient } from '@/lib/supabase/admin'

const MANAGER_ROLES = ['owner', 'admin', 'manager']

// Dono/gerente logado com Google e com acesso à loja.
export async function managerStore(storeId: string) {
  const user = await getCurrentUser()
  if (!user) return { user: null, store: null }
  const businesses = await getManagementContext(user.id)
  const store = businesses
    .flatMap((business) => business.stores.map((row) => ({ ...row, role: business.role })))
    .find((row) => row.id === storeId && MANAGER_ROLES.includes(row.role))
  return { user, store: store || null }
}

// Sessão aberta pelo link do WhatsApp (/r/*): mesma regra de /api/inventory/state.
export async function waLinkStore(request: NextRequest) {
  const token = request.cookies.get(BALCAO_SESSION_COOKIE)?.value
  if (!token) return null
  try {
    const claims = await verifyBalcaoSessionToken(token)
    if (!claims.store_id) return null
    const { data: session } = await createAdminClient().from('whatsapp_sessions')
      .select('wa_id, store_id, fluxo_atual, expires_at, payload')
      .eq('wa_id', claims.wa_id).eq('store_id', claims.store_id).maybeSingle()
    if (!session?.fluxo_atual || new Date(session.expires_at).getTime() <= Date.now()) return null
    const jti = (session.payload as Record<string, unknown> | null)?.jti
    if (typeof jti === 'string' && jti !== claims.jti) return null
    return { waId: claims.wa_id, storeId: claims.store_id }
  } catch {
    return null
  }
}

export type SumUpOnboardingStatus = 'pending' | 'signing_up' | 'connected' | 'skipped'

export async function setSumUpOnboarding(storeId: string, status: SumUpOnboardingStatus) {
  await createAdminClient().from('rpg_sumup_onboarding').upsert({ store_id: storeId, status, updated_at: new Date().toISOString() }, { onConflict: 'store_id' })
}

export async function getSumUpOnboarding(storeId: string): Promise<SumUpOnboardingStatus | null> {
  const { data } = await createAdminClient().from('rpg_sumup_onboarding').select('status').eq('store_id', storeId).maybeSingle()
  return (data?.status as SumUpOnboardingStatus | undefined) || null
}

export const CONNECT_CARD_BASE = 'https://www.rpgcapital.com.br/conectar-maquininha'
export function connectCardUrl(storeId: string) {
  return `${CONNECT_CARD_BASE}?loja=${encodeURIComponent(storeId)}`
}
