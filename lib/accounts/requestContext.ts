import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from './currentUser'
import { decideOperationalAccess } from './contextPolicy'
import { permissionsForRole, type Permission, type StaffRole } from './access'
import { secretsMatch, unpackCredential, STAFF_SESSION_IDLE_MS } from './terminal'

export type TerminalContext = {
  terminalId: string
  storeId: string
  businessId: string
  installationId: string
  storeName: string
  terminalName: string
}

export type StaffContext = TerminalContext & {
  staffId: string
  staffName: string
  role: StaffRole
  permissions: ReadonlySet<Permission>
  sessionId: string
}

export async function validateTerminalCredential(value: string | null | undefined): Promise<TerminalContext | null> {
  const credential = unpackCredential(value)
  if (!credential) return null
  const admin = createAdminClient()
  const { data: terminal } = await admin.from('balcao_terminals').select('id, store_id, display_name, credential_hash, active').eq('id', credential.id).maybeSingle()
  if (!terminal?.active || !secretsMatch(credential.secret, terminal.credential_hash)) return null
  const { data: store } = await admin.from('inventory_v1_stores').select('id, business_id, installation_id, display_name, active').eq('id', terminal.store_id).maybeSingle()
  if (!store?.active || !store.business_id || !store.installation_id) return null
  void admin.from('balcao_terminals').update({ last_seen_at: new Date().toISOString() }).eq('id', terminal.id)
  return { terminalId: terminal.id, storeId: store.id, businessId: store.business_id, installationId: store.installation_id, storeName: store.display_name, terminalName: terminal.display_name }
}

export async function validateStaffSession(terminal: TerminalContext, value: string | null | undefined): Promise<StaffContext | null> {
  const credential = unpackCredential(value)
  if (!credential) return null
  const admin = createAdminClient()
  const { data: session } = await admin.from('balcao_staff_sessions').select('id, staff_id, session_hash, expires_at, last_seen_at, revoked_at').eq('id', credential.id).eq('terminal_id', terminal.terminalId).maybeSingle()
  if (!session || session.revoked_at || !secretsMatch(credential.secret, session.session_hash)) return null
  const now = Date.now()
  if (new Date(session.expires_at).getTime() <= now || now - new Date(session.last_seen_at).getTime() > STAFF_SESSION_IDLE_MS) {
    void admin.from('balcao_staff_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', session.id)
    return null
  }
  const [{ data: staff }, { data: access }] = await Promise.all([
    admin.from('balcao_staff_profiles').select('id, display_name, active').eq('id', session.staff_id).maybeSingle(),
    admin.from('balcao_staff_store_access').select('role, custom_permissions, active').eq('staff_id', session.staff_id).eq('store_id', terminal.storeId).maybeSingle(),
  ])
  if (!staff?.active || !access?.active) return null
  const role = access.role as StaffRole
  const custom = Array.isArray(access.custom_permissions) ? access.custom_permissions as Permission[] : []
  void admin.from('balcao_staff_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', session.id)
  return { ...terminal, staffId: staff.id, staffName: staff.display_name, role, permissions: permissionsForRole(role, custom), sessionId: session.id }
}

export async function authorizeInventoryContext(input: { installationId?: string | null; terminalCookie?: string | null; staffCookie?: string | null }) {
  const admin = createAdminClient()
  const terminal = await validateTerminalCredential(input.terminalCookie)
  const installationId = input.installationId || terminal?.installationId || null
  if (!installationId) return { authorized: false as const, mode: null, store: null, terminal, staff: null, user: null }

  const { data: store } = await admin.from('inventory_v1_stores').select('id, business_id, installation_id, display_name').eq('installation_id', installationId).eq('active', true).maybeSingle()
  if (!store?.business_id) return { authorized: false as const, mode: null, store: null, terminal, staff: null, user: null }

  const user = await getCurrentUser()
  let googleMember = false
  if (user) {
    const { data: member } = await admin.from('balcao_business_members').select('role').eq('business_id', store.business_id).eq('user_id', user.id).eq('active', true).maybeSingle()
    googleMember = Boolean(member)
  }

  const terminalMatches = Boolean(terminal && terminal.storeId === store.id)
  const staff = terminalMatches && terminal ? await validateStaffSession(terminal, input.staffCookie) : null
  const decision = decideOperationalAccess({ hasInstallationCookie: Boolean(input.installationId), googleMember, terminalValid: terminalMatches, staffSessionValid: Boolean(staff) })
  return { ...decision, store, terminal: terminalMatches ? terminal : null, staff, user }
}
