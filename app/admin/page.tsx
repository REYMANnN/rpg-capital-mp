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
  return <AdminDashboard data={data} />
}
