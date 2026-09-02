'use client'

import type { FinanceDashboard } from '@/lib/finance/dashboard'

const CHART_W = 760
const CHART_H = 280
const PAD_X = 42
const PAD_TOP = 24
const PAD_BOTTOM = 38
const PLOT_H = CHART_H - PAD_TOP - PAD_BOTTOM
const PLOT_W = CHART_W - PAD_X * 2

const money = (value: number) => (value / 100).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

const compactMoney = (value: number) => (value / 100).toLocaleString('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const dateLabel = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', {
  day: '2-digit',
  month: '2-digit',
})

function visibleIndexes(length: number) {
  if (length <= 45) return Array.from({ length }, (_, index) => index)
  const stride = Math.ceil(length / 45)
  return Array.from({ length }, (_, index) => index).filter((index) => index % stride === 0 || index === length - 1)
}

function scaleY(value: number, min: number, max: number) {
  if (max <= min) return PAD_TOP + PLOT_H / 2
  return PAD_TOP + PLOT_H - ((value - min) / (max - min)) * PLOT_H
}

function xAt(index: number, length: number) {
  if (length <= 1) return PAD_X + PLOT_W / 2
  return PAD_X + (index / (length - 1)) * PLOT_W
}

function linePath(values: number[], min: number, max: number) {
  return values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index, values.length).toFixed(2)} ${scaleY(value, min, max).toFixed(2)}`).join(' ')
}

function axisTicks(max: number, count = 4) {
  return Array.from({ length: count + 1 }, (_, index) => Math.round(max * index / count))
}

function EmptyChart({ message }: { message: string }) {
  return <div className="grid min-h-64 place-items-center rounded-2xl bg-slate-50 text-sm font-medium text-slate-500">{message}</div>
}

export function CashFlowChart({ data }: { data: FinanceDashboard['cashFlow'] }) {
  const indexes = visibleIndexes(data.length)
  const visible = indexes.map((index) => data[index])
  if (!visible.length) return <EmptyChart message="Ainda não há movimentações para mostrar." />

  const maximum = Math.max(1, ...visible.flatMap((day) => [day.inflowsCents, day.outflowsCents]))
  const slot = PLOT_W / Math.max(visible.length, 1)
  const barWidth = Math.max(3, Math.min(13, slot * 0.27))
  const ticks = axisTicks(maximum)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="min-w-[660px] w-full" role="img" aria-label="Gráfico de dinheiro entrando e saindo">
        {ticks.map((tick) => {
          const y = scaleY(tick, 0, maximum)
          return <g key={tick}><line x1={PAD_X} x2={CHART_W - PAD_X} y1={y} y2={y} stroke="currentColor" className="text-slate-100" /><text x={PAD_X - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px]">{compactMoney(tick)}</text></g>
        })}
        {visible.map((day, index) => {
          const center = PAD_X + slot * index + slot / 2
          const inflowY = scaleY(day.inflowsCents, 0, maximum)
          const outflowY = scaleY(day.outflowsCents, 0, maximum)
          return (
            <g key={day.date}>
              <title>{`${dateLabel(day.date)} · Entrou ${money(day.inflowsCents)} · Saiu ${money(day.outflowsCents)} · Saldo do dia ${money(day.netCents)}`}</title>
              <rect x={center - barWidth - 1} y={inflowY} width={barWidth} height={PAD_TOP + PLOT_H - inflowY} rx="3" fill="#10b981" />
              <rect x={center + 1} y={outflowY} width={barWidth} height={PAD_TOP + PLOT_H - outflowY} rx="3" fill="#fb7185" />
            </g>
          )
        })}
        <text x={PAD_X} y={CHART_H - 10} className="fill-slate-400 text-[10px]">{dateLabel(visible[0].date)}</text>
        <text x={CHART_W / 2} y={CHART_H - 10} textAnchor="middle" className="fill-slate-400 text-[10px]">{dateLabel(visible[Math.floor(visible.length / 2)].date)}</text>
        <text x={CHART_W - PAD_X} y={CHART_H - 10} textAnchor="end" className="fill-slate-400 text-[10px]">{dateLabel(visible.at(-1)!.date)}</text>
      </svg>
      <div className="mt-1 flex flex-wrap gap-5 text-xs font-semibold text-slate-500"><span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />Entrou</span><span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-rose-400" />Saiu</span></div>
    </div>
  )
}

export function BalanceTrendChart({ data }: { data: FinanceDashboard['cashFlow'] }) {
  const indexes = visibleIndexes(data.length)
  const visible = indexes.map((index) => data[index])
  if (!visible.length) return <EmptyChart message="Sem histórico de saldo neste período." />
  const values = visible.map((day) => day.balanceCents)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = Math.max(1, (max - min) * 0.15)
  const yMin = Math.max(0, min - padding)
  const yMax = max + padding
  const path = linePath(values, yMin, yMax)
  const area = `${path} L ${xAt(values.length - 1, values.length)} ${PAD_TOP + PLOT_H} L ${xAt(0, values.length)} ${PAD_TOP + PLOT_H} Z`

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="min-w-[620px] w-full" role="img" aria-label="Evolução do saldo nas contas">
      <defs><linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" /><stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" /></linearGradient></defs>
      <path d={area} fill="url(#balance-fill)" />
      <path d={path} fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {visible.map((day, index) => <circle key={day.date} cx={xAt(index, visible.length)} cy={scaleY(day.balanceCents, yMin, yMax)} r="3" fill="#2563eb"><title>{`${dateLabel(day.date)} · ${money(day.balanceCents)}`}</title></circle>)}
      <text x={PAD_X} y={CHART_H - 10} className="fill-slate-400 text-[10px]">{dateLabel(visible[0].date)}</text>
      <text x={CHART_W - PAD_X} y={CHART_H - 10} textAnchor="end" className="fill-slate-400 text-[10px]">{dateLabel(visible.at(-1)!.date)}</text>
    </svg>
  )
}

export function SalesAndCostChart({ data }: { data: FinanceDashboard['salesFlow'] }) {
  const indexes = visibleIndexes(data.length)
  const visible = indexes.map((index) => data[index])
  if (!visible.length || visible.every((day) => day.salesCents === 0 && day.cogsCents === 0)) {
    return <EmptyChart message="Ainda não há vendas registradas neste período." />
  }
  const max = Math.max(1, ...visible.flatMap((day) => [day.salesCents, day.cogsCents]))
  const salesPath = linePath(visible.map((day) => day.salesCents), 0, max)
  const cogsPath = linePath(visible.map((day) => day.cogsCents), 0, max)
  const ticks = axisTicks(max)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="min-w-[660px] w-full" role="img" aria-label="Evolução de faturamento e custo dos produtos vendidos">
        {ticks.map((tick) => {
          const y = scaleY(tick, 0, max)
          return <g key={tick}><line x1={PAD_X} x2={CHART_W - PAD_X} y1={y} y2={y} stroke="currentColor" className="text-slate-100" /><text x={PAD_X - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px]">{compactMoney(tick)}</text></g>
        })}
        <path d={salesPath} fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d={cogsPath} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {visible.map((day, index) => <g key={day.date}><circle cx={xAt(index, visible.length)} cy={scaleY(day.salesCents, 0, max)} r="3" fill="#2563eb"><title>{`${dateLabel(day.date)} · Vendas ${money(day.salesCents)} · CMV ${money(day.cogsCents)} · Sobrou ${money(day.grossProfitCents)}`}</title></circle></g>)}
        <text x={PAD_X} y={CHART_H - 10} className="fill-slate-400 text-[10px]">{dateLabel(visible[0].date)}</text>
        <text x={CHART_W - PAD_X} y={CHART_H - 10} textAnchor="end" className="fill-slate-400 text-[10px]">{dateLabel(visible.at(-1)!.date)}</text>
      </svg>
      <div className="mt-1 flex flex-wrap gap-5 text-xs font-semibold text-slate-500"><span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-blue-600" />Vendas</span><span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />Custo dos produtos (CMV)</span></div>
    </div>
  )
}

export function MarginTrendChart({ data }: { data: FinanceDashboard['salesFlow'] }) {
  const visible = data.filter((day) => day.grossMarginBps != null)
  if (!visible.length) return <EmptyChart message="Ainda não há margem suficiente para mostrar uma tendência." />
  const values = visible.map((day) => (day.grossMarginBps ?? 0) / 100)
  const min = Math.max(0, Math.min(...values) - 5)
  const max = Math.max(...values) + 5
  const path = linePath(values, min, max)

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="min-w-[620px] w-full" role="img" aria-label="Evolução da margem bruta">
      {[min, (min + max) / 2, max].map((tick) => {
        const y = scaleY(tick, min, max)
        return <g key={tick}><line x1={PAD_X} x2={CHART_W - PAD_X} y1={y} y2={y} stroke="currentColor" className="text-slate-100" /><text x={PAD_X - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px]">{tick.toFixed(0)}%</text></g>
      })}
      <path d={path} fill="none" stroke="#7c3aed" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {visible.map((day, index) => <circle key={day.date} cx={xAt(index, visible.length)} cy={scaleY((day.grossMarginBps ?? 0) / 100, min, max)} r="3" fill="#7c3aed"><title>{`${dateLabel(day.date)} · ${((day.grossMarginBps ?? 0) / 100).toFixed(1)}%`}</title></circle>)}
      <text x={PAD_X} y={CHART_H - 10} className="fill-slate-400 text-[10px]">{dateLabel(visible[0].date)}</text>
      <text x={CHART_W - PAD_X} y={CHART_H - 10} textAnchor="end" className="fill-slate-400 text-[10px]">{dateLabel(visible.at(-1)!.date)}</text>
    </svg>
  )
}

const DONUT_COLORS = ['#0f172a', '#2563eb', '#7c3aed', '#0891b2', '#10b981', '#f59e0b', '#f97316', '#e11d48']

export function ExpenseDonut({ data }: { data: FinanceDashboard['expenseCategories'] }) {
  const total = data.reduce((sum, item) => sum + item.amountCents, 0)
  if (!total) return <EmptyChart message="Nenhum gasto categorizado neste período." />
  const radius = 76
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="grid gap-5 sm:grid-cols-[260px_1fr] sm:items-center">
      <svg viewBox="0 0 240 240" className="mx-auto w-full max-w-[240px]" role="img" aria-label="Distribuição dos gastos por categoria">
        <circle cx="120" cy="120" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="30" />
        {data.slice(0, DONUT_COLORS.length).map((item, index) => {
          const length = circumference * item.amountCents / total
          const dashOffset = -offset
          offset += length
          return <circle key={item.category} cx="120" cy="120" r={radius} fill="none" stroke={DONUT_COLORS[index]} strokeWidth="30" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={dashOffset} transform="rotate(-90 120 120)"><title>{`${item.category}: ${money(item.amountCents)} (${(item.shareBps / 100).toFixed(1)}%)`}</title></circle>
        })}
        <text x="120" y="112" textAnchor="middle" className="fill-slate-500 text-[11px] font-semibold">Total de gastos</text>
        <text x="120" y="137" textAnchor="middle" className="fill-slate-950 text-[16px] font-black">{compactMoney(total)}</text>
      </svg>
      <div className="space-y-3">
        {data.slice(0, DONUT_COLORS.length).map((item, index) => <div key={item.category} className="flex items-center justify-between gap-4 text-sm"><span className="flex min-w-0 items-center gap-2"><i className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: DONUT_COLORS[index] }} /><span className="truncate font-semibold text-slate-700">{item.category}</span></span><span className="shrink-0 font-bold tabular-nums text-slate-950">{(item.shareBps / 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span></div>)}
      </div>
    </div>
  )
}
