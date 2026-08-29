import ActivateDevice from '@/components/accounts/ActivateDevice'
export default async function ActivatePage({ params }: { params: Promise<{ token: string }> }) { const { token } = await params; return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950"><ActivateDevice token={token} /></main> }
