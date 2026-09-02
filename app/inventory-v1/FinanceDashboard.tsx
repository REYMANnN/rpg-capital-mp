'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  CheckCircle2,
  Download,
  Landmark,
  LayoutDashboard,
  Link2,
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
import BankConnections from './finance/BankConnections'

const PERIODS = [7, 30, 90] as const
const VIEWS = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'sales', label: 'Vendas', icon: ShoppingCart },
  { id: 'expenses', label: 'Gastos', icon: ReceiptText },
  { id: 'transactions', label: 'Movimentações', icon: WalletCards },
  { id: 'connections', label: 'Conexões', icon: Link2 },
] as const

type ViewId = (typeof VIEWS)[number]['id']
type TransactionFilter = 'all' | 'in' | 'out' | 'internal'
type DashboardPayload = { ok?: boolean; dashboard?: FinanceDashboardData; error?: string }

const money = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const transactionDate = (value: string) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
const percent = (bps: number | null) => bps == null ? '—' : `${(bps / 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

function changeLabel(value: number | null, positiveIsGood = true) {
  if (value == null) return { text: 'Sem período anterior', good: null as boolean | null }
  return {
    text: `${value >= 0 ? '+' : ''}${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs. período anterior`,
    good: positiveIsGood ? value >= 0 : value <= 0,
  }
}

function MetricCard({ label, value, helper, change, positiveIsGood = true, icon: Icon, eyebrow }: {
  label: string
  value: string
  helper?: string
  change?: number | null
  positiveIsGood?: boolean
  icon?: typeof WalletCards
  eyebrow?: string
}) {
  const delta = change === undefined ? null : changeLabel(change, positiveIsGood)
  return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div>{eyebrow ? <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{eyebrow}</p> : null}<h3 className="mt-1 text-sm font-bold text-slate-700">{label}</h3></div>
      {Icon ? <span className="rounded-2xl bg-slate-100 p-2.5 text-slate-600"><Icon className="h-4 w-4" /></span> : null}
    </div>
    <p className="mt-4 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{value}</p>
    {helper ? <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p> : null}
    {delta ? <p className={`mt-3 text-xs font-bold ${delta.good == null ? 'text-slate-400' : delta.good ? 'text-emerald-700' : 'text-rose-600'}`}>{delta.text}</p> : null}
  </article>
}

function Panel({ title, subtitle, children, action }: { title: string; subtitle?: string; children: ReactNode; action?: ReactNode }) {
  return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-black tracking-tight text-slate-950 sm:text-xl">{title}</h2>{subtitle ? <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">{subtitle}</p> : null}</div>{action}</div>
    {children}
  </article>
}

function EmptyBankNotice({ openConnections }: { openConnections: () => void }) {
  return <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5 sm:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><b className="text-sm text-blue-950">Conecte uma conta para ver o dinheiro real entrando e saindo.</b><p className="mt-1 text-xs leading-5 text-blue-800">Vendas, margem e estoque continuam vindo do Balcão. Saldo e movimentações bancárias aparecem depois do consentimento Open Finance.</p></div>
      <button onClick={openConnections} className="min-h-10 shrink-0 rounded-xl bg-blue-950 px-4 py-2 text-xs font-black text-white">Conectar conta bancária</button>
    </div>
  </div>
}

function OverviewPage({ dashboard, openConnections }: { dashboard: FinanceDashboardData; openConnections: () => void }) {
  const s = dashboard.summary
  const hasBank = dashboard.accounts.some((account) => account.status === 'active')
  const cashPositive = s.netCashFlowCents >= 0
  const salesChange = dashboard.comparison.available ? dashboard.comparison.changes.salesPct : null
  const topExpense = dashboard.expenseCategories[0]

  return <div className="space-y-5">
    {!hasBank ? <EmptyBankNotice openConnections={openConnections} /> : null}
    <section className="grid gap-5 xl:grid-cols-[1.45fr_.55fr]">
      <Panel title="Dinheiro entrando e saindo" subtitle={hasBank ? `Nos últimos ${dashboard.period.days} dias, entrou ${money(s.bankInflowsCents)} e saiu ${money(s.bankOutflowsCents)} das contas.` : 'O gráfico começa a usar movimentações reais assim que uma conta for conectada.'}>
        <CashFlowChart data={dashboard.cashFlow} />
      </Panel>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <MetricCard label="Entrou menos saiu" value={hasBank ? money(s.netCashFlowCents) : '—'} helper="Fluxo líquido, sem transferências entre suas próprias contas." icon={cashPositive ? TrendingUp : TrendingDown} change={hasBank && dashboard.comparison.available ? dashboard.comparison.changes.netCashFlowPct : null} />
        <MetricCard label="Saldo disponível agora" value={hasBank ? money(s.bankBalanceCents) : '—'} helper={hasBank ? `${dashboard.accounts.filter((a) => a.status === 'active').length} conta(s) conectada(s).` : 'Aguardando conexão bancária.'} icon={Landmark} />
      </div>
    </section>

    <section className="grid gap-4 md:grid-cols-3">
      <MetricCard eyebrow="Vendas" label="Quanto você vendeu" value={money(s.salesCents)} helper="Faturamento registrado pelo caixa do Balcão." change={dashboard.comparison.available ? dashboard.comparison.changes.salesPct : null} icon={ShoppingCart} />
      <MetricCard eyebrow="Resultado das vendas" label="Quanto sobrou das vendas" value={money(s.grossProfitCents)} helper={`Lucro bruto. Margem atual: ${percent(s.grossMarginBps)}.`} change={dashboard.comparison.available ? dashboard.comparison.changes.grossProfitPct : null} icon={BadgeDollarSign} />
      <MetricCard eyebrow="Estoque" label="Mercadoria disponível" value={s.inventoryDays == null ? 'Sem estimativa' : `${s.inventoryDays.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`} helper={`${money(s.inventoryValueCents)} investidos no estoque atual, pelo custo médio.`} icon={Package} />
    </section>

    <section className="grid gap-5 xl:grid-cols-[1fr_.7fr]">
      <Panel title="Evolução do seu saldo" subtitle="Saldo consolidado ao final de cada dia."><BalanceTrendChart data={dashboard.cashFlow} /></Panel>
      <Panel title="O que merece sua atenção" subtitle="Leitura rápida do período, sem precisar interpretar uma planilha.">
        <div className="space-y-3">
          <div className={`rounded-2xl border p-4 ${hasBank && !cashPositive ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><div className="flex gap-3">{hasBank && !cashPositive ? <AlertTriangle className="h-5 w-5 text-amber-700" /> : <CheckCircle2 className="h-5 w-5 text-emerald-700" />}<div><b className="text-sm">{!hasBank ? 'Conecte o banco para completar a leitura de caixa' : cashPositive ? 'Seu caixa terminou positivo' : 'Seu caixa merece atenção'}</b><p className="mt-1 text-xs text-slate-600">{!hasBank ? 'Os indicadores operacionais já funcionam; os bancários aguardam Open Finance.' : cashPositive ? `Entrou ${money(s.netCashFlowCents)} a mais do que saiu.` : `Saiu ${money(Math.abs(s.netCashFlowCents))} a mais do que entrou.`}</p></div></div></div>
          {salesChange != null ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><b className="text-sm">{salesChange >= 0 ? 'Suas vendas cresceram' : 'Suas vendas caíram'}</b><p className="mt-1 text-xs text-slate-600">{Math.abs(salesChange).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% contra o período anterior.</p></div> : null}
          {topExpense ? <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4"><b className="text-sm">{topExpense.category} foi seu maior grupo de gastos</b><p className="mt-1 text-xs text-slate-600">{money(topExpense.amountCents)} no período.</p></div> : null}
        </div>
      </Panel>
    </section>
  </div>
}

function SalesPage({ dashboard }: { dashboard: FinanceDashboardData }) {
  const s = dashboard.summary
  return <div className="space-y-5">
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Vendas no período" value={money(s.salesCents)} helper="Faturamento registrado no Balcão." change={dashboard.comparison.available ? dashboard.comparison.changes.salesPct : null} icon={ShoppingCart} />
      <MetricCard label="Custo dos produtos vendidos" value={money(s.cogsCents)} helper="CMV: custo dos itens efetivamente vendidos." change={dashboard.comparison.available ? dashboard.comparison.changes.cogsPct : null} positiveIsGood={false} icon={Package} />
      <MetricCard label="Quanto sobrou das vendas" value={money(s.grossProfitCents)} helper="Lucro bruto = vendas menos CMV." change={dashboard.comparison.available ? dashboard.comparison.changes.grossProfitPct : null} icon={BadgeDollarSign} />
      <MetricCard label="Margem bruta" value={percent(s.grossMarginBps)} helper="Percentual que sobra após o custo dos produtos." icon={TrendingUp} />
    </section>
    <Panel title="Vendas e custo dos produtos" subtitle="Faturamento × CMV ao longo do período."><SalesAndCostChart data={dashboard.salesFlow} /></Panel>
    <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <Panel title="Quanto sobra de cada venda" subtitle="Evolução da margem bruta."><MarginTrendChart data={dashboard.salesFlow} /></Panel>
      <div className="grid gap-4"><MetricCard eyebrow="Termo contábil" label="CMV" value={money(s.cogsCents)} helper="Custo das Mercadorias Vendidas." icon={Package} /><MetricCard eyebrow="Estoque" label="Estoque a custo" value={money(s.inventoryValueCents)} helper={s.inventoryDays == null ? 'Sem vendas suficientes para estimar dias.' : `${s.inventoryDays.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias no ritmo atual.`} icon={WalletCards} /></div>
    </section>
  </div>
}

function ExpensesPage({ dashboard }: { dashboard: FinanceDashboardData }) {
  const total = dashboard.expenseCategories.reduce((sum, item) => sum + item.amountCents, 0)
  const max = Math.max(1, ...dashboard.expenseCategories.map((item) => item.amountCents))
  return <div className="space-y-5">
    <section className="grid gap-4 md:grid-cols-3"><MetricCard label="Total de saídas" value={money(dashboard.summary.bankOutflowsCents)} helper="Sem transferências próprias." change={dashboard.comparison.available ? dashboard.comparison.changes.bankOutflowsPct : null} positiveIsGood={false} icon={ArrowUpRight} /><MetricCard label="Saídas categorizadas" value={money(total)} helper={`${dashboard.expenseCategories.length} categoria(s).`} icon={ReceiptText} /><MetricCard label="Maior categoria" value={dashboard.expenseCategories[0]?.category || '—'} helper={dashboard.expenseCategories[0] ? money(dashboard.expenseCategories[0].amountCents) : 'Aguardando movimentações.'} icon={BadgeDollarSign} /></section>
    <section className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
      <Panel title="Para onde foi seu dinheiro" subtitle="Participação por categoria."><ExpenseDonut data={dashboard.expenseCategories} /></Panel>
      <Panel title="Gastos por categoria" subtitle="Do maior para o menor."><div className="space-y-4">{dashboard.expenseCategories.map((item) => <div key={item.category}><div className="mb-1.5 flex justify-between gap-3 text-sm"><span><b>{item.category}</b><small className="ml-2 text-slate-400">{item.transactionCount} lançamento(ões)</small></span><b>{money(item.amountCents)}</b></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-800" style={{ width: `${Math.max(2, item.amountCents / max * 100)}%` }} /></div></div>)}{!dashboard.expenseCategories.length ? <p className="text-sm text-slate-500">Nenhum gasto bancário categorizado neste período.</p> : null}</div></Panel>
    </section>
    <Panel title="Quem recebeu mais dinheiro" subtitle="Fornecedores e outras contrapartes, por valor."><div className="divide-y divide-slate-100">{dashboard.topCounterparties.slice(0, 20).map((item) => <div key={item.name} className="grid gap-1 py-3 sm:grid-cols-[1fr_180px_130px]"><b className="truncate text-sm">{item.name}</b><span className="text-xs text-slate-500">{item.category}</span><b className="text-sm sm:text-right">{money(item.amountCents)}</b></div>)}{!dashboard.topCounterparties.length ? <p className="py-4 text-sm text-slate-500">Aguardando movimentações bancárias.</p> : null}</div></Panel>
  </div>
}

function TransactionsPage({ dashboard }: { dashboard: FinanceDashboardData }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<TransactionFilter>('all')
  const accountById = useMemo(() => new Map(dashboard.accounts.map((account) => [account.id, account])), [dashboard.accounts])
  const filtered = useMemo(() => dashboard.transactions.filter((transaction) => {
    if (filter === 'in' && transaction.amountCents <= 0) return false
    if (filter === 'out' && transaction.amountCents >= 0) return false
    if (filter === 'internal' && !transaction.isInternalTransfer) return false
    const needle = query.trim().toLocaleLowerCase('pt-BR')
    if (!needle) return true
    return [transaction.counterpartyName, transaction.description, transaction.category, transaction.counterpartyTaxId, transaction.transactionType].filter(Boolean).some((value) => String(value).toLocaleLowerCase('pt-BR').includes(needle))
  }), [dashboard.transactions, filter, query])

  function exportCsv() {
    const rows = [['Data','Tipo','Contraparte','CPF/CNPJ','Descrição','Categoria','Valor','Conta','Fonte'], ...filtered.map((transaction) => {
      const account = accountById.get(transaction.accountId)
      return [transaction.postedAt, transaction.transactionType || (transaction.amountCents >= 0 ? 'Entrada' : 'Saída'), transaction.counterpartyName || '', transaction.counterpartyTaxId || '', transaction.description, transaction.category, (transaction.amountCents / 100).toFixed(2).replace('.', ','), account?.institutionName || '', transaction.source]
    })]
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"','""')}"`).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a'); link.href = url; link.download = `balcao-movimentacoes-${dashboard.period.start}-${dashboard.period.end}.csv`; link.click(); URL.revokeObjectURL(url)
  }

  return <div className="space-y-5">
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{dashboard.accounts.map((account) => <article key={account.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><Landmark className="h-5 w-5 text-blue-700" /><b className="mt-4 block text-sm">{account.institutionName}</b><span className="mt-1 block text-xs text-slate-500">{account.accountName || account.accountType || 'Conta'}{account.maskedNumber ? ` · •••• ${account.maskedNumber}` : ''}</span><p className="mt-4 text-2xl font-black">{money(account.balanceCents)}</p></article>)}</section>
    <Panel title="Movimentações" subtitle="Extrato consolidado. Filtre, investigue ou exporte para o contador." action={<button onClick={exportCsv} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black"><Download className="h-4 w-4" />Exportar CSV</button>}>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row"><label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar empresa, categoria, CNPJ ou descrição" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><div className="flex gap-1 rounded-xl bg-slate-100 p-1">{([['all','Tudo'],['in','Entradas'],['out','Saídas'],['internal','Transferências']] as const).map(([id,label]) => <button key={id} onClick={() => setFilter(id)} className={`rounded-lg px-3 text-xs font-bold ${filter === id ? 'bg-white shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div></div>
      <div className="divide-y divide-slate-100">{filtered.slice(0,200).map((transaction) => { const credit = transaction.amountCents > 0; const account = accountById.get(transaction.accountId); return <article key={transaction.id} className="grid gap-2 py-4 lg:grid-cols-[90px_1fr_150px_140px] lg:items-center"><div className="flex items-center gap-2 text-xs text-slate-500">{credit ? <ArrowDownRight className="h-4 w-4 text-emerald-600" /> : <ArrowUpRight className="h-4 w-4 text-rose-500" />}{transactionDate(transaction.postedAt)}</div><div><b className="block truncate text-sm">{transaction.counterpartyName || transaction.description}</b><p className="mt-1 text-[11px] text-slate-500">{transaction.category}{transaction.counterpartyTaxId ? ` · ${transaction.counterpartyTaxId}` : ''}{transaction.transactionType ? ` · ${transaction.transactionType}` : ''}</p></div><span className="text-xs text-slate-500">{account?.institutionName || 'Conta'}</span><b className={`lg:text-right ${credit ? 'text-emerald-700' : ''}`}>{credit ? '+' : '−'} {money(Math.abs(transaction.amountCents))}</b></article> })}{!filtered.length ? <p className="py-8 text-center text-sm text-slate-500">Nenhuma movimentação encontrada.</p> : null}</div>
    </Panel>
  </div>
}

export default function FinanceDashboard() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30)
  const [view, setView] = useState<ViewId>('overview')
  const [dashboard, setDashboard] = useState<FinanceDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(nextDays = days) {
    setLoading(true); setError('')
    try {
      const response = await fetch(`/api/balcao/finance/dashboard?days=${nextDays}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as DashboardPayload
      if (!response.ok || !payload.dashboard) throw new Error(payload.error || 'Não conseguimos carregar o Financeiro.')
      setDashboard(payload.dashboard)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não conseguimos carregar o Financeiro.') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load(days) }, [days]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('finance')
    if (requested === 'connections') setView('connections')
  }, [])

  if (!dashboard && loading) return <div className="grid min-h-80 place-items-center rounded-3xl border border-slate-200 bg-white"><RefreshCw className="h-6 w-6 animate-spin text-blue-700" /></div>
  if (!dashboard) return <div className="rounded-3xl border border-red-200 bg-red-50 p-6"><b className="text-red-900">Financeiro indisponível</b><p className="mt-2 text-sm text-red-700">{error}</p><button onClick={() => void load(days)} className="mt-4 rounded-xl bg-red-900 px-4 py-2 text-sm font-bold text-white">Tentar novamente</button></div>

  return <div className="space-y-5 font-sans text-slate-950">
    <section className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-lg">
      <div className="p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-5"><div><span className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">Financeiro</span><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Entenda seu negócio sem precisar ser contador</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Vendas e estoque vêm do Balcão. Saldo e movimentações vêm das contas que você autorizar pelo Open Finance.</p></div><div className="flex items-center gap-2"><div className="flex rounded-xl bg-white/10 p-1">{PERIODS.map((period) => <button key={period} onClick={() => setDays(period)} className={`min-h-10 rounded-lg px-3 text-sm font-bold ${days === period ? 'bg-white text-slate-950' : 'text-slate-300'}`}>{period}d</button>)}</div>{loading ? <RefreshCw className="h-5 w-5 animate-spin text-slate-400" /> : <button onClick={() => void load(days)} aria-label="Atualizar Financeiro" className="rounded-xl p-3 text-slate-300 hover:bg-white/10"><RefreshCw className="h-5 w-5" /></button>}</div></div></div>
      <nav className="flex overflow-x-auto border-t border-white/10 px-3 sm:px-5" aria-label="Áreas do Financeiro">{VIEWS.map(({ id,label,icon:Icon }) => <button key={id} onClick={() => setView(id)} className={`flex min-h-14 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-bold ${view === id ? 'border-sky-300 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>
    </section>
    {error ? <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{error}</p> : null}
    {view === 'overview' ? <OverviewPage dashboard={dashboard} openConnections={() => setView('connections')} /> : null}
    {view === 'sales' ? <SalesPage dashboard={dashboard} /> : null}
    {view === 'expenses' ? <ExpensesPage dashboard={dashboard} /> : null}
    {view === 'transactions' ? <TransactionsPage dashboard={dashboard} /> : null}
    {view === 'connections' ? <BankConnections onFinanceChanged={() => void load(days)} /> : null}
    <p className="px-1 text-xs leading-5 text-slate-400">Valores bancários mostram movimentações reais das contas conectadas. Vendas, CMV e margem vêm da operação registrada no Balcão; por isso entrada bancária e faturamento não são tratados como a mesma coisa.</p>
  </div>
}
