import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AutomationsHub from '@/app/inventory-v1/AutomationsHub'
import InventoryRoleGate from '@/components/accounts/InventoryRoleGate'
import { authorizeInventoryContext } from '@/lib/accounts/requestContext'
import { INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE } from '@/lib/accounts/terminal'

export const metadata = { title: 'Automações · BALCÃO' }

export default async function AutomationsPage() {
  const jar = await cookies()
  const context = await authorizeInventoryContext({ installationId: jar.get(INVENTORY_INSTALLATION_COOKIE)?.value, terminalCookie: jar.get(TERMINAL_COOKIE)?.value, staffCookie: jar.get(STAFF_SESSION_COOKIE)?.value })
  if (!context.authorized || !context.store) redirect('/work')
  const role = context.mode === 'staff' ? (context.staff?.role ?? 'custom') : 'manager'
  const permissions = context.mode === 'staff' ? context.staff?.permissions : null
  if (context.mode === 'staff' && !permissions?.has('automations.view')) redirect('/inventory-v1')
  return <InventoryRoleGate role={role} managementAccess={context.mode !== 'staff'}><main className="min-h-screen bg-slate-50 p-4 text-slate-950 sm:p-6"><div className="mx-auto max-w-6xl"><header className="mb-5 rounded-2xl bg-slate-950 px-5 py-4 text-white"><b>BALCÃO</b><span className="ml-3 text-sm text-slate-300">Automações</span></header><AutomationsHub storeId={String(context.store.id)} managementAccess={context.mode !== 'staff'}/></div></main></InventoryRoleGate>
}
