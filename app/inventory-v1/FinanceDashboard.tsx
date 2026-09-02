'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Landmark, RefreshCw, WalletCards } from 'lucide-react'
import type { FinanceDashboard as FinanceDashboardData } from '@/lib/finance/dashboard'

const PERIODS = [7, 30, 90] as const

type DashboardPayload = { ok?: boolean; dashboard?: FinanceDashboardData; error?: string }

const money = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const shortMoney = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })
const dateLabel = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const transactionDate = (value: string) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p> : null}
    </article>
  )
}

function FlowChart({ data }: { data: FinanceDashboardData['cashFlow'] }) {
  const visible = data.length > 30 ? data.filter((_, index) => index % 3 === 0 || index === data.length - 1) : data
  const maximum = Math.max(1, ...visible.flatMap((day) => [day.inflowsCents, day.outflowsCents]))
  return (
    <div className="mt-5 overflow-x-auto pb-2">
      <div className="flex min-w-[620px] items-end gap-2" style={{ height: 190 }}>
        {visible.map((day) => (
          <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div className="flex h-36 w-full items-end justify-center gap-1">
              <div title={`Entradas ${money(day.inflowsCents)}`} className="w-[38%] rounded-t bg-emerald-500/80" style={{ height: `${Math.max(day.inflowsCents ? 5 : 0, day.inflowsCents / maximum * 100)}%` }} />
              <div title={`Saídas ${money(day.outflowsCents)}`} className="w-[38%] rounded-t bg-rose-400/80" style={{ height: `${Math.max(day.outflowsCents ? 5 : 0, day.outflowsCents / maximum * 100)}%` }} />
            </div>
            <span className="text-[10px] font-semibold text-slate-400">{dateLabel(day.date)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-5 text-xs font-semibold text-slate-500">
        <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500/80" />Entradas</span>
        <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-rose-400/80" />Saídas</span>
      </div>
    </div>
  )
}

function SalesChart({ data }: { data: FinanceDashboardData['salesFlow'] }) {
  const visible = data.length > 30 ? data.filter((_, index) => index % 3 === 0 || index === data.length - 1) : data
  const maximum = Math.max(1, ...visible.map((day) => day.salesCents))
  return (
    <div className="mt-5 overflow-x-auto pb-2">
      <div className="flex min-w-[620px] items-end gap-2" style={{ height: 170 }}>
        {visible.map((day) => {
          const profit = Math.max(0, day.salesCents - day.cogsCents)
          const cogsPct = day.salesCents > 0 ? day.cogsCents / day.salesCents * 100 : 0
          const profitPct = day.salesCents > 0 ? profit / day.salesCents * 100 : 0
          return (
            <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <div title={`Faturamento ${money(day.salesCents)} · CMV ${money(day.cogsCents)}`} className="flex w-[70%] flex-col-reverse overflow-hidden rounded-t bg-slate-100" style={{ height: `${Math.max(day.salesCents ? 6 : 0, day.salesCents / maximum * 100)}%` }}>
                <div className="bg-blue-700/80" style={{ height: `${cogsPct}%` }} />
                <div className="bg-sky-300/90" style={{ height: `${profitPct}%` }} />
              </div>
              <span className="text-[10px] font-semibold text-slate-400">{dateLabel(day.date)}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-5 text-xs font-semibold text-slate-500">
        <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-blue-700/80" />CMV</span>
        <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-sky-300/90" />Lucro bruto</span>
      </div>
    </div>
  )
}

export default function FinanceDashboard() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30)
  const [dashboard, setDashboard] = useState<FinanceDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(nextDays = days) {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/balcao/finance/dashboard?days=${nextDays}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as DashboardPayload
      if (!response.ok || !payload.dashboard) throw new Error(payload.error || 'Não conseguimos carregar o Financeiro.')
      setDashboard(payload.dashboard)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não conseguimos carregar o Financeiro.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load(days) }, [days]) // eslint-disable-line react-hooks/exhaustive-deps

  const maxExpense = useMemo(() => Math.max(1, ...(dashboard?.expenseCategories.map((item) => item.amountCents) ?? [1])), [dashboard])

  if (!dashboard && loading) {
    return <div className="grid min-h-72 place-items-center rounded-3xl border border-slate-200 bg-white"><RefreshCw className="h-6 w-6 animate-spin text-blue-700" /></div>
  }

  if (!dashboard) {
    return <div className="rounded-3xl border border-red-200 bg-red-50 p-6"><b className="text-red-900">Financeiro indisponível</b><p className="mt-2 text-sm text-red-700">{error}</p><button onClick={() => void load(days)} className="mt-4 rounded-xl bg-red-900 px-4 py-2 text-sm font-bold text-white">Tentar novamente</button></div>
  }

  const s = dashboard.summary
  const margin = s.grossMarginBps == null ? '—' : `${(s.grossMarginBps / 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

  return (
    <div className="space-y-5 font-sans text-slate-950">
      <section className="overflow-hidden rounded-3xl bg-slate-950 p-5 text-white shadow-lg sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">Financeiro</span>
              {dashboard.previewMode ? <span className="rounded-full bg-amber-300/15 px-3 py-1 text-xs font-bold text-amber-200 ring-1 ring-inset ring-amber-300/25">Dados de demonstração</span> : null}
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Seu negócio em números</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Movimentação bancária e desempenho das vendas aparecem separados para não confundir entrada de dinheiro com faturamento.</p>
          </div>
          <div className="flex rounded-xl bg-white/10 p-1">
            {PERIODS.map((period) => <button key={period} onClick={() => setDays(period)} className={`min-h-10 rounded-lg px-3 text-sm font-bold transition ${days === period ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/10'}`}>{period}d</button>)}
          </div>
        </div>
        <div className="mt-7 flex items-end justify-between gap-4 border-t border-white/10 pt-5">
          <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Saldo nas contas</p><p className="mt-1 text-3xl font-black sm:text-4xl">{money(s.bankBalanceCents)}</p></div>
          {loading ? <RefreshCw className="h-5 w-5 animate-spin text-slate-400" /> : <button onClick={() => void load(days)} aria-label="Atualizar Financeiro" className="rounded-xl p-3 text-slate-300 hover:bg-white/10"><RefreshCw className="h-5 w-5" /></button>}
        </div>
      </section>

      {error ? <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{error}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Entradas bancárias" value={money(s.bankInflowsCents)} detail="Movimentações positivas, sem transferências próprias" />
        <Stat label="Saídas bancárias" value={money(s.bankOutflowsCents)} detail="Movimentações negativas, sem transferências próprias" />
        <Stat label="Fluxo líquido" value={money(s.netCashFlowCents)} detail="Entradas menos saídas no período" />
        <Stat label="Faturamento" value={money(s.salesCents)} detail="Vendas registradas no Balcão" />
        <Stat label="Margem bruta" value={margin} detail={s.marginEstimated ? 'Estimativa: parte do histórico não possui custo congelado' : 'Lucro bruto ÷ faturamento'} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="CMV" value={money(s.cogsCents)} detail="Custo das mercadorias vendidas" />
        <Stat label="Lucro bruto" value={money(s.grossProfitCents)} detail="Faturamento menos CMV" />
        <Stat label="Estoque a custo" value={money(s.inventoryValueCents)} detail="Capital atual imobilizado em mercadoria" />
        <Stat label="Dias de estoque" value={s.inventoryDays == null ? '—' : `${s.inventoryDays.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`} detail="Estimativa usando o ritmo de CMV do período" />
        <Stat label="Contas" value={String(dashboard.accounts.filter((account) => account.status === 'active').length)} detail="Contas incluídas no saldo consolidado" />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Fluxo de caixa</p><h2 className="mt-1 text-xl font-black">Entradas × saídas</h2></div><WalletCards className="h-5 w-5 text-slate-400" /></div>
          <FlowChart data={dashboard.cashFlow} />
        </article>
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Operação</p><h2 className="mt-1 text-xl font-black">Faturamento e CMV</h2></div>
          <SalesChart data={dashboard.salesFlow} />
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Despesas</p><h2 className="mt-1 text-xl font-black">Para onde o dinheiro está indo</h2></div>
          <div className="mt-5 space-y-4">
            {dashboard.expenseCategories.length ? dashboard.expenseCategories.map((item) => (
              <div key={item.category}>
                <div className="mb-1.5 flex items-center justify-between gap-4 text-sm"><b>{item.category}</b><span className="font-bold tabular-nums text-slate-600">{money(item.amountCents)}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-700" style={{ width: `${Math.max(2, item.amountCents / maxExpense * 100)}%` }} /></div>
              </div>
            )) : <p className="text-sm text-slate-500">Nenhuma saída categorizada neste período.</p>}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3"><Landmark className="h-5 w-5 text-blue-700" /><div><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Contas</p><h2 className="mt-1 text-xl font-black">Saldos conectados</h2></div></div>
          <div className="mt-5 divide-y divide-slate-100">
            {dashboard.accounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0"><b className="block truncate text-sm">{account.institutionName}</b><span className="mt-1 block text-xs text-slate-500">{account.accountName || account.accountType || 'Conta'}{account.maskedNumber ? ` · •••• ${account.maskedNumber}` : ''}</span></div>
                <b className="whitespace-nowrap tabular-nums">{money(account.balanceCents)}</b>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 sm:p-6"><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Movimentações</p><h2 className="mt-1 text-xl font-black">Extrato consolidado</h2></div>
        <div className="divide-y divide-slate-100">
          {dashboard.transactions.length ? dashboard.transactions.slice(0, 30).map((transaction) => {
            const credit = transaction.amountCents > 0
            return (
              <article key={transaction.id} className="grid gap-3 p-4 sm:grid-cols-[90px_1fr_160px] sm:items-center sm:px-6">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">{credit ? <ArrowDownRight className="h-4 w-4 text-emerald-600" /> : <ArrowUpRight className="h-4 w-4 text-rose-500" />}{transactionDate(transaction.postedAt)}</div>
                <div className="min-w-0"><b className="block truncate text-sm">{transaction.counterpartyName || transaction.description}</b><div className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-500"><span>{transaction.category}</span>{transaction.transactionType ? <span>· {transaction.transactionType}</span> : null}{transaction.counterpartyTaxId ? <span>· {transaction.counterpartyTaxId}</span> : null}{transaction.isInternalTransfer ? <span>· Transferência própria</span> : null}</div></div>
                <b className={`text-right tabular-nums ${credit ? 'text-emerald-700' : 'text-slate-900'}`}>{credit ? '+' : '−'} {money(Math.abs(transaction.amountCents))}</b>
              </article>
            )
          }) : <p className="p-6 text-sm text-slate-500">Nenhuma movimentação neste período.</p>}
        </div>
      </section>

      <p className="px-1 text-xs leading-5 text-slate-400">Valores bancários refletem movimentações das contas; faturamento e margem vêm do registro operacional do Balcão. Por isso os números podem não coincidir exatamente no mesmo período.</p>
    </div>
  )
}
