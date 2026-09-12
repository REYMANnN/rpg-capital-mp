'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bot, CheckCircle2, Clock3, Lightbulb, Pause, Play, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'

type DemoAutomation = {
  id: string
  name: string
  description: string
  category: string
  status: 'active' | 'paused'
  mode: 'Avisar' | 'Recomendar' | 'Automático'
  matches: number
}

type Activity = { id: string; automation: string; text: string; when: string }

const STORAGE_KEY = 'balcao-demo-automations-v1'
const INITIAL: DemoAutomation[] = [
  { id: 'stock-low', name: 'Avisar quando o estoque estiver baixo', description: 'Acompanha o estoque mínimo e chama atenção antes de faltar produto.', category: 'Estoque', status: 'active', mode: 'Avisar', matches: 3 },
  { id: 'margin-drop', name: 'Proteger margem de venda', description: 'Encontra itens em que custo e preço deixaram a margem abaixo do esperado.', category: 'Preços e margem', status: 'active', mode: 'Recomendar', matches: 2 },
  { id: 'reorder', name: 'Sugerir reposição de mercadoria', description: 'Usa vendas recentes e estoque atual para sugerir quanto comprar.', category: 'Estoque', status: 'paused', mode: 'Recomendar', matches: 5 },
  { id: 'daily-summary', name: 'Resumo diário da operação', description: 'Consolida vendas, margem, caixa e produtos que merecem atenção.', category: 'Gestão', status: 'active', mode: 'Automático', matches: 1 },
]

function nowLabel() {
  return new Date().toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}

export default function DemoAutomationsHub() {
  const [automations, setAutomations] = useState<DemoAutomation[]>(INITIAL)
  const [activity, setActivity] = useState<Activity[]>([
    { id: 'a1', automation: 'Avisar quando o estoque estiver baixo', text: '3 produtos abaixo do estoque mínimo.', when: 'Hoje, 14:20' },
    { id: 'a2', automation: 'Proteger margem de venda', text: '2 produtos com margem abaixo da meta.', when: 'Hoje, 10:05' },
    { id: 'a3', automation: 'Resumo diário da operação', text: 'Resumo da manhã preparado.', when: 'Hoje, 08:00' },
  ])
  const [notice, setNotice] = useState('')

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) setAutomations(JSON.parse(raw))
    } catch {}
  }, [])

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(automations)) } catch {}
  }, [automations])

  const active = useMemo(() => automations.filter((item) => item.status === 'active').length, [automations])
  const matches = useMemo(() => automations.filter((item) => item.status === 'active').reduce((sum, item) => sum + item.matches, 0), [automations])

  function toggle(id: string) {
    setAutomations((current) => current.map((item) => item.id === id ? { ...item, status: item.status === 'active' ? 'paused' : 'active' } : item))
  }

  function run(item: DemoAutomation) {
    if (item.status !== 'active') return
    setActivity((current) => [{ id: crypto.randomUUID(), automation: item.name, text: `${item.matches} ocorrência(s) analisada(s) na demonstração.`, when: nowLabel() }, ...current])
    setNotice(`${item.name} executada na conta de teste.`)
    window.setTimeout(() => setNotice(''), 2800)
  }

  return <div className="space-y-5 font-sans text-slate-950">
    {notice ? <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" />{notice}</div> : null}

    <section className="overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-lg sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-300">Automações · demonstração</p><h1 className="mt-2 text-3xl font-black tracking-tight">O BALCÃO trabalhando pelo gerente.</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Ative, pause e execute regras como faria em uma loja real. Nesta conta, nenhuma integração ou ação externa é disparada.</p></div>
        <span className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-black">DADOS FICTÍCIOS</span>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-3">
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Bot className="h-5 w-5 text-emerald-700" /><strong className="mt-4 block text-3xl">{active}</strong><span className="mt-1 block text-sm text-slate-500">Automações ativas</span></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><ShieldCheck className="h-5 w-5 text-emerald-700" /><strong className="mt-4 block text-3xl">{matches}</strong><span className="mt-1 block text-sm text-slate-500">Itens analisados agora</span></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Lightbulb className="h-5 w-5 text-emerald-700" /><strong className="mt-4 block text-3xl">2</strong><span className="mt-1 block text-sm text-slate-500">Sugestões do BALCÃO</span></article>
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-emerald-700">Minhas automações</p><h2 className="mt-1 text-xl font-black">Regras configuradas</h2></div><Sparkles className="h-5 w-5 text-emerald-700" /></div>
      <div className="mt-5 grid gap-3">
        {automations.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${item.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{item.status === 'active' ? 'ATIVA' : 'PAUSADA'}</span><span className="text-xs font-bold text-slate-400">{item.category} · {item.mode}</span></div><h3 className="mt-3 font-black">{item.name}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{item.description}</p><p className="mt-2 text-xs font-bold text-emerald-700">{item.matches} ocorrência(s) nos dados atuais</p></div>
            <div className="flex flex-wrap gap-2"><button type="button" disabled={item.status !== 'active'} onClick={() => run(item)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold disabled:opacity-40"><Play className="h-4 w-4" />Executar agora</button><button type="button" onClick={() => toggle(item.id)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold">{item.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{item.status === 'active' ? 'Pausar' : 'Ativar'}</button></div>
          </div>
        </article>)}
      </div>
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div><p className="text-xs font-black uppercase tracking-[.16em] text-slate-400">Histórico</p><h2 className="mt-1 text-xl font-black">Atividade recente</h2></div>
      <div className="mt-4 divide-y divide-slate-100">{activity.slice(0, 8).map((item) => <div key={item.id} className="flex gap-3 py-4"><span className="mt-0.5 rounded-xl bg-slate-100 p-2 text-slate-600"><Clock3 className="h-4 w-4" /></span><div className="min-w-0 flex-1"><b className="text-sm">{item.automation}</b><p className="mt-1 text-xs text-slate-500">{item.text}</p></div><span className="shrink-0 text-xs text-slate-400">{item.when}</span></div>)}</div>
    </section>

    <button type="button" onClick={() => { setAutomations(INITIAL); setNotice('Automações da demonstração restauradas.'); window.setTimeout(() => setNotice(''), 2800) }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600"><RefreshCw className="h-4 w-4" />Restaurar automações de exemplo</button>
  </div>
}
