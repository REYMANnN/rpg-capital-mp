import { NextRequest, NextResponse } from 'next/server'
import type { Permission } from './access'
import { authorizeInventoryContext } from './requestContext'
import { INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE } from './terminal'

export const INVENTORY_READ_PERMISSION: Permission = 'inventory.view'
export const INVENTORY_WRITE_PERMISSION: Permission = 'inventory.write'

type InventoryRequestAccess = Awaited<ReturnType<typeof authorizeInventoryContext>>

type AuthorizedInventoryRequest = {
  ok: true
  context: InventoryRequestAccess & { store: NonNullable<InventoryRequestAccess['store']> }
  installationId: string
}

type RejectedInventoryRequest = {
  ok: false
  response: NextResponse
}

export async function authorizeInventoryRequest(
  request: NextRequest,
  permission: Permission = INVENTORY_READ_PERMISSION,
): Promise<AuthorizedInventoryRequest | RejectedInventoryRequest> {
  const context = await authorizeInventoryContext({
    installationId: request.cookies.get(INVENTORY_INSTALLATION_COOKIE)?.value,
    terminalCookie: request.cookies.get(TERMINAL_COOKIE)?.value,
    staffCookie: request.cookies.get(STAFF_SESSION_COOKIE)?.value,
  })

  if (!context.authorized || !context.store) {
    return { ok: false, response: NextResponse.json({ ok: false, error: 'not_authorized' }, { status: 401 }) }
  }

  if (context.mode === 'staff' && !context.staff?.permissions.has(permission)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }) }
  }

  return {
    ok: true,
    context: context as AuthorizedInventoryRequest['context'],
    installationId: String(context.store.installation_id),
  }
}
