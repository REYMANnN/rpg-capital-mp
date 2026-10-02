import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Integrações e RPG for Developers — RPG Capital',
  description: 'Conecte sistemas à RPG para ler ou escrever produtos, estoque, vendas, financeiro e preços com autorização explícita do lojista.',
  alternates: { canonical: 'https://rpgcapital.com.br/integracoes' },
  robots: { index: true, follow: true },
}

const capabilities = [
  ['Produtos', 'Leia cadastros e, com autorização, crie ou altere produtos.'],
  ['Estoque', 'Consulte o estoque e registre entradas, saídas e ajustes.'],
  ['Vendas', 'Consulte vendas ou envie vendas de outro sistema para a RPG.'],
  ['Financeiro', 'Consulte transações e informações financeiras autorizadas.'],
  ['Preços', 'Leia histórico e recomendações ou aplique alterações autorizadas.'],
  ['Webhooks', 'Receba eventos para manter seu sistema sincronizado com a RPG.'],
]

export default function IntegrationsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/" className="text-xl font-black tracking-tight">RPG</Link>
          <nav className="flex gap-5 text-sm font-semibold text-slate-300">
            <Link href="/developers/docs">Documentação</Link>
            <Link href="/developers/login" className="text-blue-400">RPG for Developers</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[1.2fr_.8fr] lg:items-center">
        <div>
          <p className="text-sm font-bold tracking-[0.2em] text-blue-400">RPG FOR DEVELOPERS</p>
          <h1 className="mt-5 max-w-3xl text-5xl font-black tracking-tight sm:text-6xl">Construa seu sistema sobre os dados da RPG.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">Crie uma aplicação, gere sua chave, peça somente as permissões necessárias e envie um link seguro para o lojista autorizar a conexão.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/developers/login" className="rounded-xl bg-blue-600 px-6 py-3 font-bold hover:bg-blue-500">Criar conta Developer</Link>
            <Link href="/developers/docs" className="rounded-xl border border-slate-700 px-6 py-3 font-bold hover:bg-slate-900">Ler documentação</Link>
          </div>
        </div>
        <pre className="overflow-x-auto rounded-2xl border border-slate-800 bg-black p-6 text-xs leading-6 text-slate-300"><code>{'GET /api/public/v1/products\nAuthorization: Bearer rpg_dev_live_...\nX-RPG-Connection-Id: 5c62...\n\n200 OK\n{\n  "data": [...]\n}'}</code></pre>
      </section>

      <section className="border-y border-slate-800 bg-slate-900/50">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="text-sm font-bold tracking-[0.18em] text-blue-400">COMO FUNCIONA</p>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {[
              ['1', 'Crie seu app', 'Entre no RPG for Developers com Google e crie uma aplicação.'],
              ['2', 'Gere sua chave', 'Defina quais scopes aquela chave poderá utilizar.'],
              ['3', 'Peça autorização', 'Gere um link com os acessos que deseja e envie ao lojista.'],
              ['4', 'Use a API', 'Com a chave e o Connection ID, acesse apenas o que foi autorizado.'],
            ].map(([n,t,d]) => <article key={n} className="rounded-2xl border border-slate-800 bg-slate-950 p-5"><span className="text-sm font-black text-blue-400">{n}</span><h2 className="mt-3 text-lg font-bold">{t}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{d}</p></article>)}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-3xl font-bold">Uma API para a operação da loja.</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map(([title, description]) => <article key={title} className="rounded-2xl border border-slate-800 p-5"><h3 className="font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{description}</p></article>)}
        </div>
      </section>

      <section className="border-t border-slate-800">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-2xl font-bold">O lojista continua no controle.</h2>
          <p className="mt-3 max-w-3xl leading-7 text-slate-300">Uma chave Developer sozinha não acessa nenhuma loja. Cada conexão exige autorização explícita do proprietário ou administrador, e leitura e escrita são permissões separadas.</p>
        </div>
      </section>
    </main>
  )
}
