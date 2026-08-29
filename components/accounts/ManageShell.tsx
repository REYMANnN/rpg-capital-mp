'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { ManagementBusiness } from '@/lib/accounts/currentUser'

const sections = ['Início', 'Vendas', 'Estoque', 'Análises', 'Equipe', 'Mais'] as const

type Section = typeof sections[number]

export default function ManageShell({ userName, businesses }: { userName: string; businesses: ManagementBusiness[] }) {
  const [businessId, setBusinessId] = useState(businesses[0].id)
  const business = useMemo(() => businesses.find((item) => item.id === businessId) ?? businesses[0], [businessId, businesses])
  const [storeId, setStoreId] = useState(business.stores[0]?.id ?? '')
  const [section, setSection] = useState<Section>('Início')
  const store = business.stores.find((item) => item.id === storeId) ?? business.stores[0]

  function changeBusiness(id: string) {
    setBusinessId(id)
    const next = businesses.find((item) => item.id === id)
    setStoreId(next?.stores[0]?.id ?? '')
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-bold tracking-[0.16em] text-blue-700">BALCÃO</p><p className="mt-1 text-sm text-slate-600">Olá, {userName.split(' ')[0]}</p></div>
          <div className="flex flex-wrap gap-2">
            {businesses.length > 1 ? <label className="sr-only" htmlFor="business">Negócio</label> : null}
            {businesses.length > 1 ? <select id="business" value={business.id} onChange={(e) => changeBusiness(e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base"><>{businesses.map((item) => <option value={item.id} key={item.id}>{item.displayName}</option>)}</></select> : null}
            {business.stores.length > 1 ? <><label className="sr-only" htmlFor="store">Loja</label><select id="store" value={store?.id ?? ''} onChange={(e) => setStoreId(e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base">{business.stores.map((item) => <option value={item.id} key={item.id}>{item.displayName}</option>)}</select></> : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 sm:pb-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {section === 'Início' ? <><h1 className="text-2xl font-bold">{store?.displayName ?? business.displayName}</h1><p className="mt-2 text-slate-600">Tudo que precisa de atenção aparece aqui.</p><div className="mt-6 grid gap-3 sm:grid-cols-3"><Link href="/inventory-v1" className="min-h-24 rounded-xl border border-slate-200 p-4 font-semibold hover:bg-slate-50">Abrir estoque e operação</Link><button onClick={() => setSection('Equipe')} className="min-h-24 rounded-xl border border-slate-200 p-4 text-left font-semibold hover:bg-slate-50">Gerenciar equipe</button><button onClick={() => setSection('Análises')} className="min-h-24 rounded-xl border border-slate-200 p-4 text-left font-semibold hover:bg-slate-50">Ver análises</button></div></> : null}
          {section === 'Vendas' ? <><h1 className="text-2xl font-bold">Vendas</h1><p className="mt-2 text-slate-600">Acompanhe as vendas registradas nesta loja.</p><Link href="/inventory-v1" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white">Abrir checkout</Link></> : null}
          {section === 'Estoque' ? <><h1 className="text-2xl font-bold">Estoque</h1><p className="mt-2 text-slate-600">Cadastre, escaneie e ajuste produtos.</p><Link href="/inventory-v1" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white">Abrir estoque</Link></> : null}
          {section === 'Análises' ? <><h1 className="text-2xl font-bold">Análises</h1><p className="mt-2 text-slate-600">Seus indicadores financeiros e operacionais vão aparecer aqui conforme a loja registra dados.</p></> : null}
          {section === 'Equipe' ? <><h1 className="text-2xl font-bold">Equipe</h1><p className="mt-2 text-slate-600">Crie perfis de Caixa, Estoque e Gerente para esta loja.</p><div id="team-manager-root" data-store-id={store?.id ?? ''} className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Carregando gestão de equipe…</div></> : null}
          {section === 'Mais' ? <><h1 className="text-2xl font-bold">Mais</h1><div className="mt-5 grid gap-3 sm:grid-cols-2"><button className="min-h-12 rounded-xl border p-4 text-left font-semibold">Lojas</button><button className="min-h-12 rounded-xl border p-4 text-left font-semibold">Dispositivos</button><button className="min-h-12 rounded-xl border p-4 text-left font-semibold">Integrações e APIs</button><button className="min-h-12 rounded-xl border p-4 text-left font-semibold">Configurações</button></div></> : null}
        </section>
      </div>

      <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white px-2 py-2 sm:static sm:mx-auto sm:mt-0 sm:max-w-7xl sm:border-0 sm:bg-transparent sm:px-6">
        <div className="grid grid-cols-6 gap-1">{sections.map((item) => <button key={item} onClick={() => setSection(item)} aria-current={section === item ? 'page' : undefined} className={`min-h-12 rounded-lg px-1 text-xs font-semibold sm:text-sm ${section === item ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>{item}</button>)}</div>
      </nav>
    </main>
  )
}
