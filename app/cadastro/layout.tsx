import { Suspense } from 'react'

export default function CadastroLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="min-h-screen bg-[#0057d2] flex items-center justify-center"><div className="text-white text-lg">Carregando...</div></div>}>{children}</Suspense>
}
