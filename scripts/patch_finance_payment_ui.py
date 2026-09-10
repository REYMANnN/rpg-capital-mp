from pathlib import Path

path = Path('app/inventory-v1/FinanceDashboard.tsx')
source = path.read_text(encoding='utf-8')

percent_line = "const percent = (bps: number | null) => bps == null ? '—' : `${(bps / 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`\n"
assert percent_line in source, 'percent helper not found'
source = source.replace(percent_line, percent_line + "const paymentLabel = (method: 'pix' | 'card' | 'cash' | null) => method === 'card' ? 'Cartão' : method === 'pix' ? 'Pix' : method === 'cash' ? 'Dinheiro' : 'Não informado'\n", 1)

source = source.replace('<section className="grid gap-4 md:grid-cols-3">\n      <MetricCard eyebrow="Vendas"', '<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">\n      <MetricCard eyebrow="Vendas"', 1)

profit_card = '      <MetricCard eyebrow="Resultado das vendas" label="Quanto sobrou das vendas" value={money(s.grossProfitCents)} helper={`Lucro bruto. Margem atual: ${percent(s.grossMarginBps)}.`} change={dashboard.comparison.available ? dashboard.comparison.changes.grossProfitPct : null} icon={BadgeDollarSign} />\n'
assert profit_card in source, 'overview profit card not found'
source = source.replace(profit_card, profit_card + '      <MetricCard eyebrow="Cartão" label="Saldo a receber antes das taxas" value={money(dashboard.card.pendingGrossCents)} helper="Vendas no cartão ainda não conciliadas. Valor bruto antes das taxas da maquininha." icon={WalletCards} />\n', 1)

start = source.index('function SalesPage({ dashboard }: { dashboard: FinanceDashboardData }) {')
end = source.index('\nfunction ExpensesPage(', start)
new_sales_page = r'''function SalesPage({ dashboard }: { dashboard: FinanceDashboardData }) {
  const s = dashboard.summary
  const p = dashboard.paymentSummary
  const card = dashboard.card
  const paymentTotal = p.cardSalesCents + p.pixSalesCents + p.cashSalesCents + p.legacySalesCents

  return <div className="space-y-5">
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Vendas no período" value={money(s.salesCents)} helper="Faturamento registrado no Balcão." change={dashboard.comparison.available ? dashboard.comparison.changes.salesPct : null} icon={ShoppingCart} />
      <MetricCard label="Custo dos produtos vendidos" value={money(s.cogsCents)} helper="CMV: custo dos itens efetivamente vendidos." change={dashboard.comparison.available ? dashboard.comparison.changes.cogsPct : null} positiveIsGood={false} icon={Package} />
      <MetricCard label="Quanto sobrou das vendas" value={money(s.grossProfitCents)} helper="Lucro bruto = vendas menos CMV." change={dashboard.comparison.available ? dashboard.comparison.changes.grossProfitPct : null} icon={BadgeDollarSign} />
      <MetricCard label="Margem bruta" value={percent(s.grossMarginBps)} helper="Percentual que sobra após o custo dos produtos." icon={TrendingUp} />
    </section>

    <Panel title="Vendas e custo dos produtos" subtitle="Faturamento × CMV ao longo do período."><SalesAndCostChart data={dashboard.salesFlow} /></Panel>

    <section className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <Panel title="Vendas por forma de pagamento" subtitle="Como as vendas registradas no Caixa foram pagas.">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['Cartão', p.cardSalesCents, 'Vendas aprovadas na maquininha.'],
            ['Pix', p.pixSalesCents, 'Pix confirmados no Caixa.'],
            ['Dinheiro', p.cashSalesCents, 'Recebimentos em espécie.'],
            ['Sem forma registrada', p.legacySalesCents, 'Vendas anteriores a este recurso.'],
          ].map(([label, amount, helper]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><span className="text-xs font-bold text-slate-500">{label}</span><b className="mt-2 block text-xl text-slate-950">{money(Number(amount))}</b><small className="mt-1 block text-[11px] leading-4 text-slate-500">{helper}</small></div>)}
        </div>
        {paymentTotal !== s.salesCents ? <p className="mt-4 text-xs leading-5 text-slate-500">A divisão acima usa as vendas salvas pelo Caixa. O total geral pode incluir métricas históricas consolidadas.</p> : null}
      </Panel>

      <Panel title="Cartão e repasses" subtitle="O Balcão separa a venda da entrada efetiva no banco.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-4"><span className="text-xs font-bold text-slate-500">Vendas no cartão</span><b className="mt-2 block text-xl">{money(card.grossCardSalesCents)}</b><small className="mt-1 block text-[11px] text-slate-500">Valor bruto registrado pelo Caixa.</small></div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><span className="text-xs font-bold text-amber-800">Saldo a receber antes das taxas</span><b className="mt-2 block text-xl text-amber-950">{money(card.pendingGrossCents)}</b><small className="mt-1 block text-[11px] leading-4 text-amber-800">Bruto de cartão ainda não conciliado; não é uma previsão líquida.</small></div>
          <div className="rounded-2xl border border-slate-200 p-4"><span className="text-xs font-bold text-slate-500">Repasses de cartão identificados</span><b className="mt-2 block text-xl">{money(card.recognizedSettlementCents)}</b><small className="mt-1 block text-[11px] text-slate-500">Créditos bancários reconhecidos como adquirente.</small></div>
          <div className="rounded-2xl border border-slate-200 p-4"><span className="text-xs font-bold text-slate-500">Taxa efetiva estimada</span><b className="mt-2 block text-xl">{percent(card.estimatedFeeRateBps)}</b><small className="mt-1 block text-[11px] leading-4 text-slate-500">{card.estimatedFeeRateBps == null ? 'Aguardando uma conciliação segura.' : `${money(card.estimatedFeeCents)} de diferença observada nas vendas conciliadas.`}</small></div>
        </div>

        {card.settlements.length ? <div className="mt-5 divide-y divide-slate-100 border-t border-slate-100">
          {card.settlements.slice(0, 12).map((settlement) => <div key={settlement.transactionId} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center"><div><b className="text-sm">{settlement.provider}</b><p className="mt-1 text-xs text-slate-500">{transactionDate(settlement.postedAt)} · {settlement.status === 'reconciled' && settlement.matchedGrossCents != null ? `${money(settlement.matchedGrossCents)} bruto → ${money(settlement.receivedCents)} recebido` : `${money(settlement.receivedCents)} identificado; aguardando conciliação segura`}</p></div><span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-black ${settlement.status === 'reconciled' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{settlement.status === 'reconciled' ? 'Conciliado' : 'Identificado'}</span></div>)}
        </div> : <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">Nenhum repasse de adquirente foi reconhecido neste período. O saldo bruto continua visível sem inventar taxas.</p>}
      </Panel>
    </section>

    <Panel title="Últimas vendas" subtitle="Venda, custo e lucro ficam registrados no momento em que o Caixa confirma o pagamento.">
      <div className="divide-y divide-slate-100">
        {dashboard.recentSales.map((sale) => <article key={sale.id} className="grid gap-2 py-4 md:grid-cols-[1fr_120px_130px_130px_130px] md:items-center"><div><b className="block text-sm">Venda #{sale.id.slice(0, 8)}</b><span className="mt-1 block text-xs text-slate-500">{transactionDate(sale.createdAt)}</span></div><span className="text-xs font-bold text-slate-600">{paymentLabel(sale.paymentMethod)}</span><div><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Venda</span><b className="text-sm">{money(sale.totalCents)}</b></div><div><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">CMV</span><b className="text-sm">{money(sale.cogsCents)}</b></div><div><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Lucro bruto</span><b className="text-sm text-emerald-700">{money(sale.grossProfitCents)}</b>{sale.costEstimated ? <small className="block text-[10px] text-amber-700">custo estimado</small> : null}</div></article>)}
        {!dashboard.recentSales.length ? <p className="py-8 text-center text-sm text-slate-500">As próximas vendas confirmadas no Caixa aparecerão aqui.</p> : null}
      </div>
    </Panel>

    <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <Panel title="Quanto sobra de cada venda" subtitle="Evolução da margem bruta."><MarginTrendChart data={dashboard.salesFlow} /></Panel>
      <div className="grid gap-4"><MetricCard eyebrow="Termo contábil" label="CMV" value={money(s.cogsCents)} helper="Custo das Mercadorias Vendidas." icon={Package} /><MetricCard eyebrow="Estoque" label="Estoque a custo" value={money(s.inventoryValueCents)} helper={s.inventoryDays == null ? 'Sem vendas suficientes para estimar dias.' : `${s.inventoryDays.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias no ritmo atual.`} icon={WalletCards} /></div>
    </section>
  </div>
}
'''
source = source[:start] + new_sales_page + source[end:]
path.write_text(source, encoding='utf-8')
