import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { ADMIN_COOKIE, verifyAdminSession } from '@/lib/admin/auth'
import { loadAdminMetrics } from '@/lib/admin/metrics'
import AdminDashboard from './AdminDashboard'
import AdminLogin from './AdminLogin'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Admin · RPG', robots: { index: false, follow: false } }

export default async function AdminPage() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value
  let allowed = false
  try { allowed = verifyAdminSession(token) } catch { allowed = false }
  if (!allowed) return <AdminLogin />
  const data = await loadAdminMetrics()
  return <>
    <a href="/admin/trial-accounts" className="fixed bottom-5 right-5 z-50 rounded-full bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg">Contas teste</a>
    <AdminDashboard data={data} />
  </>
}
