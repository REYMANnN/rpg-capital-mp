'use client'

import { Bot, Boxes, Cloud, FileUp, FlaskConical, ShoppingCart, UserRound, WalletCards } from 'lucide-react'
import DemoAutomationsHub from '@/app/inventory-v1/DemoAutomationsHub'
import { INVENTORY_APP_VERSION } from '@/lib/inventory/version'
import styles from '@/app/inventory-v1/inventory.module.css'

function go(tab: 'stock' | 'intake' | 'checkout' | 'finance') {
  window.location.assign(`/demo?tab=${tab}`)
}

export default function DemoAutomationsPage() {
  return <div className={styles.shell} data-balcao-demo="true">
    <header className={styles.top}>
      <div><span className={styles.brand}>BALCÃO</span></div>
      <span className={styles.status}><Cloud /><b>{INVENTORY_APP_VERSION}</b><span> · Demonstração local · EAN/UPC</span></span>
      <div className="ml-3 flex items-center gap-2 font-sans">
        <span className="hidden items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 text-xs font-black text-emerald-100 sm:inline-flex"><FlaskConical className="h-3.5 w-3.5" />DEMONSTRAÇÃO</span>
        <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-sm font-bold text-white"><UserRound className="h-4 w-4" /><span className="hidden sm:inline">Gerente Demo</span></span>
      </div>
    </header>

    <nav className={styles.nav}>
      <button onClick={() => go('stock')}><Boxes />Estoque</button>
      <button onClick={() => go('intake')}><FileUp />Entrada</button>
      <button onClick={() => go('checkout')}><ShoppingCart />Caixa</button>
      <button onClick={() => go('finance')}><WalletCards />Financeiro</button>
      <button className={styles.active}><Bot />Automações</button>
    </nav>

    <main className={styles.main}><DemoAutomationsHub /></main>
    <footer className={styles.powered}>Powered by RPG System · Conta de teste</footer>
  </div>
}
