'use client'

import { Landmark } from 'lucide-react'
import FinanceDashboard from './FinanceDashboard'

export default function FinanceOnlyShell() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="bg-slate-950 px-4 py-4 text-white sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div><span className="text-sm font-black tracking-[0.2em]">BALCÃO</span><span className="ml-3 text-xs font-semibold text-slate-400">Financeiro</span></div>
        </div>
      </header>
      <nav className="border-b border-slate-200 bg-white px-4 py-2 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <button className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white" aria-current="page"><Landmark className="h-4 w-4" />Financeiro</button>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
        <FinanceDashboard />
      </main>
      <footer className="px-4 pb-8 text-center text-xs font-semibold text-slate-400">Powered by RPG System</footer>
    </div>
  )
}
