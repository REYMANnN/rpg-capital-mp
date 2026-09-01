import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import InventoryV1 from './InventoryV1'
import InventoryRoleGate from '@/components/accounts/InventoryRoleGate'
import { authorizeInventoryContext } from '@/lib/accounts/requestContext'
import { INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE } from '@/lib/accounts/terminal'

export const metadata = {
  title: 'BALCÃO',
  description: 'Inventário, entrada de compras e checkout para mercadinhos',
}

export default async function Page() {
  if (process.env.BALCAO_ACCOUNTS_ENFORCED !== 'true') {
    return <InventoryRoleGate role="manager"><InventoryV1 /></InventoryRoleGate>
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

  const role = context.mode === 'staff' ? (context.staff?.role ?? 'custom') : 'manager'
  return <InventoryRoleGate role={role}><InventoryV1 /></InventoryRoleGate>
}
