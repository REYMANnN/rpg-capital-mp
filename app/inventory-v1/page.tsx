import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import InventoryV1 from './InventoryV1'
import FinanceOnlyShell from './FinanceOnlyShell'
import InventoryRoleGate from '@/components/accounts/InventoryRoleGate'
import { permissionsForRole } from '@/lib/accounts/access'
import { authorizeInventoryContext } from '@/lib/accounts/requestContext'
import { INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE } from '@/lib/accounts/terminal'

export const metadata = {
  title: 'BALCÃO',
  description: 'Inventário, caixa e financeiro para pequenos negócios',
}

export default async function Page() {
  if (process.env.BALCAO_ACCOUNTS_ENFORCED !== 'true') {
    return <InventoryRoleGate role="manager" managementAccess><InventoryV1 /></InventoryRoleGate>
  }

  const jar = await cookies()
  const context = await authorizeInventoryContext({
    installationId: jar.get(INVENTORY_INSTALLATION_COOKIE)?.value,
    terminalCookie: jar.get(TERMINAL_COOKIE)?.value,
    staffCookie: jar.get(STAFF_SESSION_COOKIE)?.value,
  })

  if (!context.authorized) {
    if (context.terminal) redirect('/work')
    redirect('/login')
  }

  const isStaff = context.mode === 'staff'
  const role = isStaff ? (context.staff?.role ?? 'custom') : 'manager'
  const permissions = isStaff && context.staff ? context.staff.permissions : permissionsForRole('manager')
  const canFinance = permissions.has('analysis.financial')
  const canLoadOperationalState = permissions.has('inventory.view') || permissions.has('inventory.write') || permissions.has('checkout.sell')
  const managementAccess = !isStaff

  if (canFinance && !canLoadOperationalState) {
    return <InventoryRoleGate role={role} managementAccess={false}><FinanceOnlyShell /></InventoryRoleGate>
  }

  if (!canLoadOperationalState && !canFinance) {
    redirect('/work')
  }

  return <InventoryRoleGate role={role} managementAccess={managementAccess}><InventoryV1 /></InventoryRoleGate>
}
