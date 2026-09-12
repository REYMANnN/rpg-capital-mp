import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AutomationsHub from '@/app/inventory-v1/AutomationsHub'
import InventoryRoleGate from '@/components/accounts/InventoryRoleGate'
import { authorizeInventoryContext } from '@/lib/accounts/requestContext'
import { INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE } from '@/lib/accounts/terminal'
import { createInventoryCloudClient } from '@/lib/supabase/inventoryCloud'

export const metadata = { title: 'Automações · BALCÃO' }

type StoreContext = { storeId?: string; businessId?: string; displayName?: string }

async function resolveUnenforcedStore(installationId: string | undefined) {
  if (!installationId) return null
  const { data, error } = await createInventoryCloudClient().rpc('balcao_automation_store_context', {
    p_installation_id: installationId,
  })
  if (error) {
    console.error('balcao_automation_store_context failed', error)
    return null
  }
  const store = (data ?? {}) as StoreContext
  return store.storeId ? store : null
}

function automationsPage(storeId: string, role: 'manager' | 'it' | 'custom' | 'cashier' | 'stock' | 'finance', managementAccess: boolean) {
  return <InventoryRoleGate role={role} managementAccess={managementAccess}><main className="min-h-screen bg-slate-50 p-4 text-slate-950 sm:p-6"><div className="mx-auto max-w-6xl"><header className="mb-5 rounded-2xl bg-slate-950 px-5 py-4 text-white"><b>BALCÃO</b><span className="ml-3 text-sm text-slate-300">Automações</span></header><AutomationsHub storeId={storeId} managementAccess={managementAccess}/></div></main></InventoryRoleGate>
}

export default async function AutomationsPage() {
  const jar = await cookies()

  if (process.env.BALCAO_ACCOUNTS_ENFORCED !== 'true') {
    const store = await resolveUnenforcedStore(jar.get(INVENTORY_INSTALLATION_COOKIE)?.value)
    if (!store?.storeId) redirect('/inventory-v1')
    return automationsPage(store.storeId, 'manager', true)
  }

  const context = await authorizeInventoryContext({ installationId: jar.get(INVENTORY_INSTALLATION_COOKIE)?.value, terminalCookie: jar.get(TERMINAL_COOKIE)?.value, staffCookie: jar.get(STAFF_SESSION_COOKIE)?.value })
  if (!context.authorized || !context.store) redirect('/work')
  const role = context.mode === 'staff' ? (context.staff?.role ?? 'custom') : 'manager'
  const permissions = context.mode === 'staff' ? context.staff?.permissions : null
  if (context.mode === 'staff' && !permissions?.has('automations.view')) redirect('/inventory-v1')
  return automationsPage(String(context.store.id), role, context.mode !== 'staff')
}
