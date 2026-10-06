import type { Metadata } from 'next'
import { cookies } from 'next/headers'

import { ADMIN_COOKIE, verifyAdminSession } from '@/lib/admin/auth'
import { listTrialAccounts } from '@/lib/admin/trial-accounts'
import AdminLogin from '../AdminLogin'
import TrialAccountsClient from './TrialAccountsClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Contas teste · Admin · RPG', robots: { index: false, follow: false } }

export default async function TrialAccountsPage() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value
  let allowed = false
  try { allowed = verifyAdminSession(token) } catch { allowed = false }
  if (!allowed) return <AdminLogin />
  const accounts = await listTrialAccounts()
  return <TrialAccountsClient initial={accounts} />
}
