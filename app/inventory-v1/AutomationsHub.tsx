'use client'

import { useState } from 'react'
import { Bot, Cable, ChevronRight, Download, KeyRound, Sparkles, Webhook } from 'lucide-react'

type Panel = 'home' | 'pricing' | 'connect' | 'exports' | 'advanced'

export default function AutomationsHub({ storeId, managementAccess = false }: { storeId: string; managementAccess?: boolean }) {
  const [panel, setPanel] = useState<Panel>('home')

  if (panel !== 'home') {
    return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <button type="button" onClick={() => setPanel('home')} className="min-h-10 text-sm font-bold text-blue-700">← Automações</button>
      {panel === 'pricing' ? <div className="mt-4"><p className="text-sm font-bold uppercase tracking-widest text-blue-700">Preço Inteligente</p><h2 className="mt-2 text-2xl font-bold">Automatize sem perder o controle</h2><p className="mt-2 max-w-2xl text-slate-600">O Balcão usará custo, margem, giro, estoque e histórico de vendas. Nesta primeira versão a configuração fica preparada para recomendações e automação com limites; o motor de pricing entra como módulo independente.</p></div> : null}
      {panel === 'connect' ? <div className="mt-4"><p className="text-sm font-bold uppercase tracking-widest text-blue-700">Conectar outro sistema</p><h2 className="mt-2 text-2xl font-bold">Continue usando seu ERP ou PDV</h2><p className="mt-2 max-w-2xl text-slate-600">Integrações podem trazer produtos, vendas e estoque para o Balcão sem obrigar a troca do sistema atual.</p></div> : null}
      {panel === 'exports' ? <div className="mt-4"><p className="text-sm font-bold uppercase tracking-widest text-blue-700">Usar meus dados fora do Balcão</p><h2 className="mt-2 text-2xl font-bold">Excel, Power BI e CSV</h2><p className="mt-2 max-w-2xl text-slate-600">Exporte produtos, estoque, vendas e movimentações financeiras ou conecte uma ferramenta externa pela API.</p></div> : null}
      {panel === 'advanced' ? <div className="mt-4"><p className="text-sm font-bold uppercase tracking-widest text-blue-700">Integração avançada</p><h2 className="mt-2 text-2xl font-bold">APIs e webhooks</h2><p className="mt-2 max-w-2xl text-slate-600">Crie chaves com permissões específicas e receba eventos assinados. Segredos aparecem somente uma vez na criação ou rotação.</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border p-4"><KeyRound className="h-5 w-5"/><b className="mt-3 block">Chaves de acesso</b><span className="text-sm text-slate-500">Permissões por conexão.</span></div><div className="rounded-xl border p-4"><Webhook className="h-5 w-5"/><b className="mt-3 block">Webhooks</b><span className="text-sm text-slate-500">Eventos em tempo real.</span></div><div className="rounded-xl border p-4"><Cable className="h-5 w-5"/><b className="mt-3 block">Integrações</b><span className="text-sm text-slate-500">ERP, PDV e BI.</span></div></div><p className="mt-5 text-xs text-slate-400">Loja: {storeId}{managementAccess ? ' · acesso de gestão' : ''}</p></div> : null}
    </section>
  }

  const cards = [
    { id: 'pricing' as const, title: 'Preço Inteligente', description: 'Use custo, margem, estoque e vendas para receber sugestões ou ajustar preços automaticamente.', icon: Sparkles, badge: 'Disponível em etapas' },
    { id: 'connect' as const, title: 'Conectar outro sistema', description: 'Continue usando seu ERP, PDV ou sistema da franquia e conecte os dados ao Balcão.', icon: Cable, badge: 'Integrações' },
    { id: 'exports' as const, title: 'Usar meus dados fora do Balcão', description: 'Leve produtos, estoque, vendas e financeiro para Excel, Power BI ou outro sistema.', icon: Download, badge: 'Dados' },
    { id: 'advanced' as const, title: 'Integração avançada', description: 'Chaves de acesso, webhooks e documentação para sua equipe de tecnologia.', icon: KeyRound, badge: 'Avançado' },
  ]

  return <div className="grid gap-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-700"><Bot className="h-6 w-6"/></span><div><p className="text-sm font-bold uppercase tracking-widest text-blue-700">Automações</p><h1 className="mt-1 text-2xl font-bold">Deixe o Balcão trabalhar por você</h1><p className="mt-2 max-w-3xl text-slate-600">Ative inteligência, conecte outros sistemas e use seus dados onde preferir. Recursos técnicos ficam escondidos até você precisar deles.</p></div></div>
    </section>
    <section className="grid gap-3 md:grid-cols-2">{cards.map(({ id, title, description, icon: Icon, badge }) => <button key={id} type="button" onClick={() => setPanel(id)} className="group flex min-h-40 items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/30"><span className="rounded-xl bg-slate-100 p-3 group-hover:bg-white"><Icon className="h-5 w-5"/></span><span className="min-w-0 flex-1"><span className="text-xs font-bold uppercase tracking-wider text-slate-400">{badge}</span><b className="mt-2 block text-lg">{title}</b><span className="mt-2 block text-sm leading-6 text-slate-600">{description}</span></span><ChevronRight className="mt-2 h-5 w-5 text-slate-400"/></button>)}</section>
  </div>
}
