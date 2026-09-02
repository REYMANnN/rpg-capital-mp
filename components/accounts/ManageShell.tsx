'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { ManagementBusiness } from '@/lib/accounts/currentUser'
import BankConnections from '@/app/inventory-v1/finance/BankConnections'
import TeamManager from './TeamManager'
import DeviceManager from './DeviceManager'
import StoreManager from './StoreManager'

const sections = ['Início', 'Vendas', 'Estoque', 'Análises', 'Equipe', 'Configurações'] as const
type Section = typeof sections[number]

export default function ManageShell({ userName, businesses }: { userName: string; businesses: ManagementBusiness[] }) {
  const [businessId, setBusinessId] = useState(businesses[0].id)
  const business = useMemo(() => businesses.find((item) => item.id === businessId) ?? businesses[0], [businessId, businesses])
  const [storeId, setStoreId] = useState(business.stores[0]?.id ?? '')
  const [section, setSection] = useState<Section>('Início')
  const store = business.stores.find((item) => item.id === storeId) ?? business.stores[0]
  const operationHref = store ? `/api/balcao/stores/open?storeId=${encodeURIComponent(store.id)}` : '/inventory-v1'

  function changeBusiness(id: string) {
    setBusinessId(id)
    const next = businesses.find((item) => item.id === id)
    setStoreId(next?.stores[0]?.id ?? '')
  }

  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-bold tracking-[0.16em] text-blue-700">BALCÃO</p><p className="mt-1 text-sm text-slate-600">Olá, {userName.split(' ')[0]}</p></div>
        <div className="flex flex-wrap gap-2">
          {businesses.length > 1 ? <><label className="sr-only" htmlFor="business">Negócio</label><select id="business" value={business.id} onChange={(e) => changeBusiness(e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base">{businesses.map((item) => <option value={item.id} key={item.id}>{item.displayName}</option>)}</select></> : null}
          {business.stores.length > 1 ? <><label className="sr-only" htmlFor="store">Loja</label><select id="store" value={store?.id ?? ''} onChange={(e) => setStoreId(e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base">{business.stores.map((item) => <option value={item.id} key={item.id}>{item.displayName}</option>)}</select></> : null}
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 sm:pb-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {section === 'Início' ? <><h1 className="text-2xl font-bold">{store?.displayName ?? business.displayName}</h1><p className="mt-2 text-slate-600">Tudo que precisa de atenção aparece aqui.</p><div className="mt-6 grid gap-3 sm:grid-cols-4"><Link href={operationHref} className="flex min-h-24 items-center rounded-xl border border-slate-200 p-4 font-semibold hover:bg-slate-50">Abrir estoque e operação</Link><button onClick={() => setSection('Equipe')} className="min-h-24 rounded-xl border border-slate-200 p-4 text-left font-semibold hover:bg-slate-50">Gerenciar equipe</button><button onClick={() => setSection('Análises')} className="min-h-24 rounded-xl border border-slate-200 p-4 text-left font-semibold hover:bg-slate-50">Ver análises</button><button onClick={() => setSection('Configurações')} className="min-h-24 rounded-xl border border-slate-200 p-4 text-left font-semibold hover:bg-slate-50">Configurações</button></div></> : null}
        {section === 'Vendas' ? <><h1 className="text-2xl font-bold">Vendas</h1><p className="mt-2 text-slate-600">Acompanhe e registre as vendas desta loja.</p><Link href={operationHref} className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white">Abrir checkout</Link></> : null}
        {section === 'Estoque' ? <><h1 className="text-2xl font-bold">Estoque</h1><p className="mt-2 text-slate-600">Cadastre, escaneie, ajuste e arquive produtos.</p><Link href={operationHref} className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white">Abrir estoque</Link></> : null}
        {section === 'Análises' ? <><h1 className="text-2xl font-bold">Análises</h1><p className="mt-2 text-slate-600">Indicadores financeiros e operacionais ficam disponíveis para a gestão conforme a loja registra dados.</p><div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Os modelos avançados de análise, Open Finance e crédito entram aqui sem aparecer para Caixa ou Estoque.</div></> : null}
        {section === 'Equipe' ? <><h1 className="text-2xl font-bold">Equipe</h1><p className="mt-2 text-slate-600">Crie perfis de Caixa, Estoque, Financeiro, Gerente ou personalize os módulos. Funcionários não precisam de e-mail.</p>{store ? <div className="mt-6"><TeamManager storeId={store.id} /></div> : null}</> : null}
        {section === 'Configurações' ? <><h1 className="text-2xl font-bold">Configurações</h1><p className="mt-2 text-slate-600">Contas bancárias, lojas, dispositivos e integrações sensíveis ficam sob controle da gestão.</p><div className="mt-6 grid gap-6">{store ? <section><div className="mb-4"><h2 className="text-lg font-bold">Contas bancárias</h2><p className="mt-1 text-sm text-slate-500">Conecte ou desconecte contas pelo Open Finance. O acesso é somente leitura.</p></div><BankConnections storeId={store.id} returnTo="finance" /></section> : null}{business ? <StoreManager businessId={business.id} stores={business.stores} /> : null}{store ? <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-bold">Dispositivos</h2><p className="mt-1 text-sm text-slate-500">Autorize caixas, tablets e celulares uma vez e remova o acesso quando quiser.</p><div className="mt-4"><DeviceManager storeId={store.id} /></div></section> : null}<section className="grid gap-3 sm:grid-cols-2"><div className="min-h-20 rounded-xl border border-slate-200 p-4"><b>Integrações e APIs</b><p className="mt-1 text-sm text-slate-500">Área reservada à gestão.</p></div><div className="min-h-20 rounded-xl border border-slate-200 p-4"><b>Segurança e dados</b><p className="mt-1 text-sm text-slate-500">Dados sensíveis ficam fora do acesso operacional.</p></div></section></div></> : null}
      </section>
    </div>

    <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white px-2 py-2 sm:static sm:mx-auto sm:max-w-7xl sm:border-0 sm:bg-transparent sm:px-6">
      <div className="grid grid-cols-6 gap-1">{sections.map((item) => <button key={item} onClick={() => setSection(item)} aria-current={section === item ? 'page' : undefined} className={`min-h-12 rounded-lg px-1 text-[11px] font-semibold sm:text-sm ${section === item ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>{item}</button>)}</div>
    </nav>
  </main>
}
