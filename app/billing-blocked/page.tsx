import Link from 'next/link'

export default function BillingBlockedPage() {
  return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
    <section className="mx-auto max-w-xl rounded-3xl border border-rose-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-bold tracking-[0.18em] text-blue-700">BALCÃO</p>
      <h1 className="mt-5 text-3xl font-bold">Acesso suspenso</h1>
      <p className="mt-4 leading-7 text-slate-600">Existe um pagamento pendente na assinatura deste estabelecimento. Enquanto a cobrança não for regularizada, estoque, caixa e financeiro ficam bloqueados.</p>
      <p className="mt-3 leading-7 text-slate-600">A conexão Open Finance também foi desfeita para impedir novos custos. Depois do pagamento, o responsável pela conta deve entrar novamente e reconectar o banco.</p>
      <Link href="/billing" className="mt-7 inline-flex min-h-12 items-center rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white">Área de cobrança</Link>
    </section>
  </main>
}
