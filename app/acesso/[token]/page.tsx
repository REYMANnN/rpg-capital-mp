import StaffAccessLogin from '@/components/accounts/StaffAccessLogin'

export default async function StaffAccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950 sm:py-16">
      <StaffAccessLogin token={token} />
    </main>
  )
}
