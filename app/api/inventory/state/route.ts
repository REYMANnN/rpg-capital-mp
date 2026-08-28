import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { INVENTORY_APP_VERSION } from '@/lib/inventory/version'
import { createInventoryCloudClient } from '@/lib/supabase/inventoryCloud'

const COOKIE_NAME = 'inventory_installation_id'

type StoreData = {
  products: unknown[]
  sales: unknown[]
  movements: unknown[]
  scaleRule?: unknown
}

type CloudStateResponse = {
  found?: boolean
  version?: string
  state?: unknown
}

function getInstallationId(request: NextRequest) {
  const existing = request.cookies.get(COOKIE_NAME)?.value
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return { id: existing, fresh: false }
  return { id: randomUUID(), fresh: true }
}

function withInstallationCookie(response: NextResponse, id: string, fresh: boolean) {
  if (fresh) {
    response.cookies.set(COOKIE_NAME, id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 365 * 2,
    })
  }
  return response
}

function isState(value: unknown): value is StoreData {
  if (!value || typeof value !== 'object') return false
  const state = value as StoreData
  return Array.isArray(state.products) && Array.isArray(state.sales) && Array.isArray(state.movements)
}

export async function GET(request: NextRequest) {
  const installation = getInstallationId(request)
  const supabase = createInventoryCloudClient()
  const { data, error } = await supabase.rpc('inventory_v1_get_state', {
    p_installation_id: installation.id,
  })

  if (error) {
    console.error('inventory_v1_get_state failed', error)
    return withInstallationCookie(NextResponse.json({ ok: false, error: 'state_lookup_failed' }, { status: 500 }), installation.id, installation.fresh)
  }

  const result = (data ?? {}) as CloudStateResponse
  return withInstallationCookie(NextResponse.json({
    ok: true,
    found: Boolean(result.found),
    version: result.version || INVENTORY_APP_VERSION,
    ...(result.found ? { state: result.state } : {}),
  }), installation.id, installation.fresh)
}

export async function PUT(request: NextRequest) {
  const installation = getInstallationId(request)
  let state: unknown
  try {
    state = await request.json()
  } catch {
    return withInstallationCookie(NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }), installation.id, installation.fresh)
  }

  if (!isState(state)) {
    return withInstallationCookie(NextResponse.json({ ok: false, error: 'invalid_state' }, { status: 400 }), installation.id, installation.fresh)
  }

  const supabase = createInventoryCloudClient()
  const { data, error } = await supabase.rpc('inventory_v1_sync_state', {
    p_installation_id: installation.id,
    p_state: state,
    p_app_version: INVENTORY_APP_VERSION,
  })

  if (error) {
    console.error('inventory_v1_sync_state failed', error)
    return withInstallationCookie(NextResponse.json({ ok: false, error: 'sync_failed' }, { status: 500 }), installation.id, installation.fresh)
  }

  return withInstallationCookie(NextResponse.json({ ok: true, storeId: data, version: INVENTORY_APP_VERSION }), installation.id, installation.fresh)
}
