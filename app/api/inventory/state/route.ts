import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { INVENTORY_APP_VERSION } from '@/lib/inventory/version'
import { createInventoryCloudClient } from '@/lib/supabase/inventoryCloud'
import { authorizeInventoryContext } from '@/lib/accounts/requestContext'
import { requiredPermissionsForStateChange } from '@/lib/accounts/statePolicy'
import type { Permission } from '@/lib/accounts/access'
import { writeAuditEvent } from '@/lib/accounts/audit'
import { INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE } from '@/lib/accounts/terminal'

const COOKIE_NAME = INVENTORY_INSTALLATION_COOKIE

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

function accountsEnforced() {
  return process.env.BALCAO_ACCOUNTS_ENFORCED === 'true'
}

function existingInstallationId(request: NextRequest) {
  const existing = request.cookies.get(COOKIE_NAME)?.value
  return existing && /^[0-9a-f-]{36}$/i.test(existing) ? existing : null
}

function getInstallationId(request: NextRequest) {
  const existing = existingInstallationId(request)
  if (existing) return { id: existing, fresh: false }
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

async function authorizedInstallation(request: NextRequest) {
  const previous = existingInstallationId(request)
  const context = await authorizeInventoryContext({
    installationId: previous,
    terminalCookie: request.cookies.get(TERMINAL_COOKIE)?.value,
    staffCookie: request.cookies.get(STAFF_SESSION_COOKIE)?.value,
  })
  if (!context.authorized || !context.store) return { context, installation: null }
  return {
    context,
    installation: { id: String(context.store.installation_id), fresh: previous !== context.store.installation_id },
  }
}

export async function GET(request: NextRequest) {
  let installation = getInstallationId(request)
  if (accountsEnforced()) {
    const authorized = await authorizedInstallation(request)
    if (!authorized.installation || !authorized.context.authorized) return NextResponse.json({ ok: false, error: 'not_authorized' }, { status: 401 })
    if (authorized.context.mode === 'staff' && !authorized.context.staff?.permissions.has('inventory.view')) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    installation = authorized.installation
  }

  const supabase = createInventoryCloudClient()
  const { data, error } = await supabase.rpc('inventory_v1_get_state', { p_installation_id: installation.id })

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
  let state: unknown
  try {
    state = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  if (!isState(state)) return NextResponse.json({ ok: false, error: 'invalid_state' }, { status: 400 })

  let installation = getInstallationId(request)
  let access: Awaited<ReturnType<typeof authorizeInventoryContext>> | null = null
  let required: Permission[] = []
  const supabase = createInventoryCloudClient()

  if (accountsEnforced()) {
    const authorized = await authorizedInstallation(request)
    if (!authorized.installation || !authorized.context.authorized) return NextResponse.json({ ok: false, error: 'not_authorized' }, { status: 401 })
    installation = authorized.installation
    access = authorized.context

    const { data: currentData } = await supabase.rpc('inventory_v1_get_state', { p_installation_id: installation.id })
    const current = (currentData ?? {}) as CloudStateResponse
    const before: StoreData = current.found && isState(current.state) ? current.state : { products: [], sales: [], movements: [], scaleRule: undefined }
    required = requiredPermissionsForStateChange(before, state)

    if (access.mode === 'staff') {
      const permissions = access.staff?.permissions
      if (!permissions || required.some((permission) => !permissions.has(permission))) {
        return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
      }
    }
  }

  const { data, error } = await supabase.rpc('inventory_v1_sync_state', {
    p_installation_id: installation.id,
    p_state: state,
    p_app_version: INVENTORY_APP_VERSION,
  })

  if (error) {
    console.error('inventory_v1_sync_state failed', error)
    return withInstallationCookie(NextResponse.json({ ok: false, error: 'sync_failed' }, { status: 500 }), installation.id, installation.fresh)
  }

  if (access?.store) {
    await writeAuditEvent({
      businessId: String(access.store.business_id),
      storeId: String(access.store.id),
      actorUserId: access.mode === 'google' ? access.user?.id ?? null : null,
      actorStaffId: access.mode === 'staff' ? access.staff?.staffId ?? null : null,
      terminalId: access.terminal?.terminalId ?? null,
      action: 'inventory.state_changed',
      entityType: 'store',
      entityId: String(access.store.id),
      metadata: { requiredPermissions: required },
    }).catch(() => {})
  }

  return withInstallationCookie(NextResponse.json({ ok: true, storeId: data, version: INVENTORY_APP_VERSION }), installation.id, installation.fresh)
}
