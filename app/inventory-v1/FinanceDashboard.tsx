'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  CheckCircle2,
  Download,
  Landmark,
  LayoutDashboard,
  Package,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import type { FinanceDashboard as FinanceDashboardData } from '@/lib/finance/dashboard'
import {
  BalanceTrendChart,
  CashFlowChart,
  ExpenseDonut,
  MarginTrendChart,
  SalesAndCostChart,
} from './finance/FinanceCharts'

const PERIODS = [7, 30, 90] as const
const VIEWS = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'sales', label: 'Vendas', icon: ShoppingCart },
  { id: 'expenses', label: 'Gastos', icon: ReceiptText },
  { id: 'transactions', label: 'Movimentações', icon: WalletCards },
] as const

type ViewId = (typeof VIEWS)[number]['id']
type TransactionFilter = 'all' | 'in' | 'out' | 'internal'
type DashboardPayload = { ok?: boolean; dashboard?: FinanceDashboardData; error?: string }

const money = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const shortMoney = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })
const transactionDate = (value: string) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
const percent = (bps: number | null) => bps == null ? '—' : `${(bps / 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

function changeLabel(value: number | null, positiveIsGood = true) {
  if (value == null) return { text: 'Sem período anterior', tone: 'neutral' as const }
  const good = positiveIsGood ? value >= 0 : value <= 0
  return {
    text: `${value >= 0 ? '+' : ''}${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs. período anterior`,
    tone: good ? 'good' as const : 'bad' as const,
  }
}

function MetricCard({
  eyebrow,
  label,
  value,
  helper,
  change,
  positiveIsGood = true,
  icon: Icon,
}: {
  eyebrow?: string
  label: string
  value: string
  helper?: string
  change?: number | null
  positiveIsGood?: boolean
  icon?: typeof WalletCards
}) {
  const delta = change === undefined ? null : changeLabel(change, positiveIsGood)
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{eyebrow}</p> : null}
          <h3 className="mt-1 text-sm font-bold text-slate-700">{label}</h3>
        </div>
        {Icon ? <span className="rounded-2xl bg-slate-100 p-2.5 text-slate-600"><Icon className="h-4 w-4" /></span> : null}
      </div>
      <p className="mt-4 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{value}</p>
      {helper ? <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p> : null}
      {delta ? <p className={`mt-3 text-xs font-bold ${delta.tone === 'good' ? 'text-emerald-700' : delta.tone === 'bad' ? 'text-rose-600' : 'text-slate-400'}`}>{delta.text}</p> : null}
    </article>
  )
}

function Insight({ tone, title, body }: { tone: 'good' | 'warn' | 'neutral'; title: string; body: string }) {
  const Icon = tone === 'good' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : BadgeDollarSign
  const styles = tone === 'good'
    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
    : tone === 'warn'
      ? 'border-amber-200 bg-amber-50/80 text-amber-950'
      : 'border-blue-200 bg-blue-50/70 text-blue-950'
  return (
    <article className={`rounded-2xl border p-4 ${styles}`}>
      <div className="flex gap-3"><Icon className="mt-0.5 h-5 w-5 shrink-0" /><div><b className="text-sm">{title}</b><p className="mt-1 text-xs leading-5 opacity-80">{body}</p></div></div>
    </article>
  )
}

function Panel({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-black tracking-tight text-slate-950 sm:text-xl">{title}</h2>{subtitle ? <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">{subtitle}</p> : null}</div>{action}</div>
      {children}
    </article>
  )
}

function OverviewPage({ dashboard }: { dashboard: FinanceDashboardData }) {
  const s = dashboard.summary
  const topExpense = dashboard.expenseCategories[0]
  const cashPositive = s.netCashFlowCents >= 0
  const salesChange = dashboard.comparison.available ? dashboard.comparison.changes.salesPct : null
  const inventoryDays = s.inventoryDays

  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-[1.45fr_.55fr]">
        <Panel
          title="Dinheiro entrando e saindo"
          subtitle={`Nos últimos ${dashboard.period.days} dias, entrou ${money(s.bankInflowsCents)} e saiu ${money(s.bankOutflowsCents)} das contas.`}
          action={<span className={`rounded-full px-3 py-1.5 text-xs font-black ${cashPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{cashPositive ? 'Caixa positivo' : 'Saíram mais recursos'}</span>}
        >
          <CashFlowChart data={dashboard.cashFlow} />
        </Panel>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <MetricCard label="Entrou menos saiu" value={money(s.netCashFlowCents)} helper="Também chamado de fluxo líquido. Transferências entre suas próprias contas ficam de fora." icon={cashPositive ? TrendingUp : TrendingDown} change={dashboard.comparison.available ? dashboard.comparison.changes.netCashFlowPct : null} />
          <MetricCard label="Saldo disponível agora" value={money(s.bankBalanceCents)} helper={`${dashboard.accounts.filter((account) => account.status === 'active').length} conta(s) incluída(s) no saldo.`} icon={Landmark} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard eyebrow="Vendas" label="Quanto você vendeu" value={money(s.salesCents)} helper="Faturamento registrado pelo caixa do Balcão." change={dashboard.comparison.available ? dashboard.comparison.changes.salesPct : null} icon={ShoppingCart} />
        <MetricCard eyebrow="Resultado das vendas" label="Quanto sobrou das vendas" value={money(s.grossProfitCents)} helper={`Lucro bruto. De cada R$ 100 vendidos, aproximadamente R$ ${s.grossMarginBps == null ? '—' : (s.grossMarginBps / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} ficaram após o custo dos produtos.`} change={dashboard.comparison.available ? dashboard.comparison.changes.grossProfitPct : null} icon={BadgeDollarSign} />
        <MetricCard eyebrow="Estoque" label="Mercadoria disponível" value={inventoryDays == null ? 'Sem estimativa' : `${inventoryDays.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`} helper={`${money(s.inventoryValueCents)} investidos no estoque atual, pelo custo médio.`} icon={Package} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_.7fr]">
        <Panel title="Evolução do seu saldo" subtitle="Mostra quanto dinheiro havia nas contas ao final de cada dia do período.">
          <div className="overflow-x-auto"><BalanceTrendChart data={dashboard.cashFlow} /></div>
        </Panel>
        <Panel title="O que merece sua atenção" subtitle="Leitura rápida do período, sem precisar interpretar uma planilha.">
          <div className="space-y-3">
            <Insight tone={cashPositive ? 'good' : 'warn'} title={cashPositive ? 'Seu caixa terminou positivo' : 'Seu caixa merece atenção'} body={cashPositive ? `Entrou ${money(s.netCashFlowCents)} a mais do que saiu no período.` : `Saiu ${money(Math.abs(s.netCashFlowCents))} a mais do que entrou no período.`} />
            {salesChange != null ? <Insight tone={salesChange >= 0 ? 'good' : 'warn'} title={salesChange >= 0 ? 'Suas vendas cresceram' : 'Suas vendas caíram'} body={`${Math.abs(salesChange).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% em relação ao período anterior de mesma duração.`} /> : null}
            {topExpense ? <Insight tone="neutral" title={`${topExpense.category} foi seu maior grupo de gastos`} body={`${money(topExpense.amountCents)} — ${(topExpense.shareBps / 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% das saídas categorizadas.`} /> : null}
            {inventoryDays != null && inventoryDays > 45 ? <Insight tone="warn" title="Há bastante dinheiro parado em estoque" body={`No ritmo atual de custo das vendas, o estoque equivale a cerca de ${inventoryDays.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} dias.`} /> : null}
          </div>
        </Panel>
      </section>
    </div>
  )
}

function SalesPage({ dashboard }: { dashboard: FinanceDashboardData }) {
  const s = dashboard.summary
  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Vendas no período" value={money(s.salesCents)} helper="Faturamento registrado no Balcão." change={dashboard.comparison.available ? dashboard.comparison.changes.salesPct : null} icon={ShoppingCart} />
        <MetricCard label="Custo dos produtos vendidos" value={money(s.cogsCents)} helper="CMV: quanto custaram, para você, os produtos que foram vendidos." change={dashboard.comparison.available ? dashboard.comparison.changes.cogsPct : null} positiveIsGood={false} icon={Package} />
        <MetricCard label="Quanto sobrou das vendas" value={money(s.grossProfitCents)} helper="Lucro bruto = vendas menos CMV." change={dashboard.comparison.available ? dashboard.comparison.changes.grossProfitPct : null} icon={BadgeDollarSign} />
        <MetricCard label="Margem bruta" value={percent(s.grossMarginBps)} helper="Percentual das vendas que sobra depois do custo dos produtos, antes das outras despesas." icon={TrendingUp} />
      </section>

      <Panel title="Vendas e custo dos produtos" subtitle="A linha azul mostra o faturamento; a amarela mostra o CMV. O espaço entre elas é o lucro bruto.">
        <SalesAndCostChart data={dashboard.salesFlow} />
      </Panel>

      <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <Panel title="Quanto sobra de cada venda" subtitle="Evolução da margem bruta ao longo do período. Oscilações podem indicar mudança de mix, preço ou custo.">
          <div className="overflow-x-auto"><MarginTrendChart data={dashboard.salesFlow} /></div>
        </Panel>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <MetricCard eyebrow="Termo contábil" label="CMV" value={money(s.cogsCents)} helper="Custo das Mercadorias Vendidas. É o custo histórico dos itens efetivamente vendidos." icon={Package} />
          <MetricCard eyebrow="Estoque" label="Estoque a custo" value={money(s.inventoryValueCents)} helper={s.inventoryDays == null ? 'Ainda não há vendas suficientes para estimar dias de estoque.' : `Equivale a aproximadamente ${s.inventoryDays.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias no ritmo atual de CMV.`} icon={WalletCards} />
        </div>
      </section>

      {s.marginEstimated ? <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><b>Atenção:</b> parte do histórico é anterior ao congelamento do custo no momento da venda; nesses registros, a margem é uma estimativa usando o melhor custo disponível.</p> : null}
    </div>
  )
}

function ExpensesPage({ dashboard }: { dashboard: FinanceDashboardData }) {
  const total = dashboard.expenseCategories.reduce((sum, item) => sum + item.amountCents, 0)
  const max = Math.max(1, ...dashboard.expenseCategories.map((item) => item.amountCents))
  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total de saídas" value={money(dashboard.summary.bankOutflowsCents)} helper="Saídas bancárias sem transferências entre suas próprias contas." change={dashboard.comparison.available ? dashboard.comparison.changes.bankOutflowsPct : null} positiveIsGood={false} icon={ArrowUpRight} />
        <MetricCard label="Saídas categorizadas" value={money(total)} helper={`${dashboard.expenseCategories.length} categoria(s) identificada(s) no período.`} icon={ReceiptText} />
        <MetricCard label="Maior categoria" value={dashboard.expenseCategories[0]?.category || '—'} helper={dashboard.expenseCategories[0] ? `${money(dashboard.expenseCategories[0].amountCents)} no período.` : 'Ainda não há gastos categorizados.'} icon={BadgeDollarSign} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
        <Panel title="Para onde foi seu dinheiro" subtitle="Participação de cada categoria nos gastos identificados.">
          <ExpenseDonut data={dashboard.expenseCategories} />
        </Panel>
        <Panel title="Gastos por categoria" subtitle="Do maior para o menor, com participação e quantidade de movimentações.">
          <div className="space-y-4">
            {dashboard.expenseCategories.map((item) => <div key={item.category}><div className="mb-1.5 flex items-end justify-between gap-4"><div><b className="text-sm text-slate-800">{item.category}</b><p className="mt-0.5 text-[11px] text-slate-400">{item.transactionCount} movimentação(ões) · {(item.shareBps / 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</p></div><b className="text-sm tabular-nums text-slate-950">{money(item.amountCents)}</b></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-800" style={{ width: `${Math.max(2, item.amountCents / max * 100)}%` }} /></div></div>)}
            {!dashboard.expenseCategories.length ? <p className="text-sm text-slate-500">Nenhum gasto categorizado neste período.</p> : null}
          </div>
        </Panel>
      </section>

      <Panel title="Quem recebeu mais dinheiro" subtitle="Útil para identificar fornecedores, despesas recorrentes e concentração de pagamentos.">
        <div className="overflow-hidden rounded-2xl border border-slate-100">
          <div className="hidden grid-cols-[1fr_180px_130px_90px] gap-3 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-wider text-slate-400 sm:grid"><span>Contraparte</span><span>Categoria</span><span className="text-right">Total</span><span className="text-right">Lançamentos</span></div>
          <div className="divide-y divide-slate-100">{dashboard.topCounterparties.slice(0, 20).map((item) => <div key={item.name} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_180px_130px_90px] sm:items-center"><b className="truncate text-slate-800">{item.name}</b><span className="text-xs text-slate-500">{item.category}</span><b className="tabular-nums sm:text-right">{money(item.amountCents)}</b><span className="text-xs text-slate-500 sm:text-right">{item.transactionCount}</span></div>)}</div>
        </div>
      </Panel>
    </div>
  )
}

function TransactionsPage({ dashboard }: { dashboard: FinanceDashboardData }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<TransactionFilter>('all')
  const accountById = useMemo(() => new Map(dashboard.accounts.map((account) => [account.id, account])), [dashboard.accounts])
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR')
    return dashboard.transactions.filter((transaction) => {
      if (filter === 'in' && transaction.amountCents <= 0) return false
      if (filter === 'out' && transaction.amountCents >= 0) return false
      if (filter === 'internal' && !transaction.isInternalTransfer) return false
      if (!normalized) return true
      return [transaction.counterpartyName, transaction.description, transaction.category, transaction.counterpartyTaxId, transaction.transactionType]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(normalized))
    })
  }, [dashboard.transactions, filter, query])

  function exportCsv() {
    const rows = [
      ['Data', 'Tipo', 'Contraparte', 'CPF/CNPJ', 'Descrição', 'Categoria', 'Valor', 'Conta', 'Fonte'],
      ...filtered.map((transaction) => {
        const account = accountById.get(transaction.accountId)
        return [
          transaction.postedAt,
          transaction.transactionType || (transaction.amountCents >= 0 ? 'Entrada' : 'Saída'),
          transaction.counterpartyName || '',
          transaction.counterpartyTaxId || '',
          transaction.description,
          transaction.category,
          (transaction.amountCents / 100).toFixed(2).replace('.', ','),
          account?.institutionName || '',
          transaction.source,
        ]
      }),
    ]
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `balcao-movimentacoes-${dashboard.period.start}-${dashboard.period.end}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {dashboard.accounts.map((account) => <article key={account.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><span className="rounded-2xl bg-blue-50 p-2.5 text-blue-700"><Landmark className="h-5 w-5" /></span><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${account.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{account.status === 'active' ? 'Ativa' : account.status}</span></div><b className="mt-4 block text-sm text-slate-800">{account.institutionName}</b><span className="mt-1 block text-xs text-slate-500">{account.accountName || account.accountType || 'Conta'}{account.maskedNumber ? ` · •••• ${account.maskedNumber}` : ''}</span><p className="mt-4 text-2xl font-black tabular-nums text-slate-950">{money(account.balanceCents)}</p></article>)}
      </section>

      <Panel
        title="Movimentações"
        subtitle="Extrato consolidado das contas. Use os filtros para investigar ou exporte o período para o contador."
        action={<button onClick={exportCsv} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50"><Download className="h-4 w-4" />Exportar CSV</button>}
      >
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-500"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar empresa, categoria, CNPJ ou descrição" className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" /></label>
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">{([['all', 'Tudo'], ['in', 'Entradas'], ['out', 'Saídas'], ['internal', 'Transferências']] as const).map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-xs font-bold ${filter === id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100">
          <div className="hidden grid-cols-[90px_1fr_150px_140px] gap-3 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-wider text-slate-400 lg:grid"><span>Data</span><span>Movimentação</span><span>Conta</span><span className="text-right">Valor</span></div>
          <div className="divide-y divide-slate-100">{filtered.slice(0, 200).map((transaction) => {
            const credit = transaction.amountCents > 0
            const account = accountById.get(transaction.accountId)
            return <article key={transaction.id} className="grid gap-2 px-4 py-4 lg:grid-cols-[90px_1fr_150px_140px] lg:items-center"><div className="flex items-center gap-2 text-xs font-bold text-slate-500">{credit ? <ArrowDownRight className="h-4 w-4 text-emerald-600" /> : <ArrowUpRight className="h-4 w-4 text-rose-500" />}{transactionDate(transaction.postedAt)}</div><div className="min-w-0"><b className="block truncate text-sm text-slate-800">{transaction.counterpartyName || transaction.description}</b><div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-500"><span>{transaction.category}</span>{transaction.transactionType ? <span>· {transaction.transactionType}</span> : null}{transaction.counterpartyTaxId ? <span>· {transaction.counterpartyTaxId}</span> : null}{transaction.categoryConfidence != null ? <span>· categoria {(transaction.categoryConfidence * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% conf.</span> : null}{transaction.isInternalTransfer ? <span>· transferência própria</span> : null}</div></div><span className="text-xs text-slate-500">{account?.institutionName || 'Conta'}</span><b className={`tabular-nums lg:text-right ${credit ? 'text-emerald-700' : 'text-slate-950'}`}>{credit ? '+' : '−'} {money(Math.abs(transaction.amountCents))}</b></article>
          })}</div>
          {!filtered.length ? <p className="p-8 text-center text-sm text-slate-500">Nenhuma movimentação encontrada com esses filtros.</p> : null}
        </div>
        {filtered.length > 200 ? <p className="mt-3 text-xs text-slate-400">Mostrando 200 de {filtered.length.toLocaleString('pt-BR')} movimentações. O CSV exporta todas as movimentações filtradas.</p> : null}
      </Panel>
    </div>
  )
}

export default function FinanceDashboard() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30)
  const [view, setView] = useState<ViewId>('overview')
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

  if (!dashboard && loading) {
    return <div className="grid min-h-80 place-items-center rounded-3xl border border-slate-200 bg-white"><RefreshCw className="h-6 w-6 animate-spin text-blue-700" /></div>
  }

  if (!dashboard) {
    return <div className="rounded-3xl border border-red-200 bg-red-50 p-6"><b className="text-red-900">Financeiro indisponível</b><p className="mt-2 text-sm text-red-700">{error}</p><button onClick={() => void load(days)} className="mt-4 rounded-xl bg-red-900 px-4 py-2 text-sm font-bold text-white">Tentar novamente</button></div>
  }

  return (
    <div className="space-y-5 font-sans text-slate-950">
      <section className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-lg">
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">Financeiro</span>{dashboard.previewMode ? <span className="rounded-full bg-amber-300/15 px-3 py-1 text-xs font-bold text-amber-200 ring-1 ring-inset ring-amber-300/25">Dados de demonstração</span> : null}</div>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Entenda seu negócio sem precisar ser contador</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">A primeira camada explica o que aconteceu. As páginas de detalhe deixam os números técnicos disponíveis quando você ou seu contador precisarem.</p>
            </div>
            <div className="flex items-center gap-2"><div className="flex rounded-xl bg-white/10 p-1">{PERIODS.map((period) => <button key={period} onClick={() => setDays(period)} className={`min-h-10 rounded-lg px-3 text-sm font-bold transition ${days === period ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/10'}`}>{period}d</button>)}</div>{loading ? <RefreshCw className="h-5 w-5 animate-spin text-slate-400" /> : <button onClick={() => void load(days)} aria-label="Atualizar Financeiro" className="rounded-xl p-3 text-slate-300 hover:bg-white/10"><RefreshCw className="h-5 w-5" /></button>}</div>
          </div>
        </div>
        <nav className="flex overflow-x-auto border-t border-white/10 px-3 sm:px-5" aria-label="Áreas do Financeiro">{VIEWS.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setView(id)} className={`flex min-h-14 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-bold transition sm:px-4 ${view === id ? 'border-sky-300 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>
      </section>

      {error ? <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{error}</p> : null}

      {view === 'overview' ? <OverviewPage dashboard={dashboard} /> : null}
      {view === 'sales' ? <SalesPage dashboard={dashboard} /> : null}
      {view === 'expenses' ? <ExpensesPage dashboard={dashboard} /> : null}
      {view === 'transactions' ? <TransactionsPage dashboard={dashboard} /> : null}

      <p className="px-1 text-xs leading-5 text-slate-400">Valores bancários mostram movimentações das contas. Vendas, CMV e margem vêm da operação registrada no Balcão. Por isso entrada bancária e faturamento não são tratados como a mesma coisa.</p>
    </div>
  )
}
