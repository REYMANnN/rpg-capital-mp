import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Documentação da API — RPG for Developers',
  description: 'Documentação técnica da RPG API: autenticação, RPG Connect, scopes, endpoints, escrita, idempotência e exemplos.',
  alternates: { canonical: 'https://rpgcapital.com.br/developers/docs' },
  robots: { index: true, follow: true },
}

const scopes = [
  ['products:read', 'Ler produtos'],
  ['products:write', 'Criar e alterar produtos'],
  ['inventory:read', 'Ler estoque e movimentos'],
  ['inventory:write', 'Registrar movimentos de estoque'],
  ['sales:read', 'Ler vendas'],
  ['sales:ingest', 'Registrar vendas externas'],
  ['finance:read', 'Ler financeiro'],
  ['pricing:read', 'Ler histórico e recomendações de preço'],
  ['pricing:write', 'Aplicar alterações de preço'],
  ['webhooks:manage', 'Gerenciar webhooks'],
] as const

const endpoints = [
  ['GET', '/api/public/v1/products', 'products:read'],
  ['GET', '/api/public/v1/products/{id}', 'products:read'],
  ['GET', '/api/public/v1/inventory', 'inventory:read'],
  ['GET', '/api/public/v1/inventory/movements', 'inventory:read'],
  ['GET', '/api/public/v1/sales', 'sales:read'],
  ['GET', '/api/public/v1/sales/{id}', 'sales:read'],
  ['GET', '/api/public/v1/finance/transactions', 'finance:read'],
  ['GET', '/api/public/v1/finance/summary', 'finance:read'],
  ['GET', '/api/public/v1/pricing/history', 'pricing:read'],
  ['POST', '/api/public/v1/imports/products', 'products:write'],
  ['POST', '/api/public/v1/imports/inventory-movements', 'inventory:write'],
  ['POST', '/api/public/v1/imports/sales', 'sales:ingest'],
  ['POST', '/api/public/v1/pricing/recommendations/{id}/apply', 'pricing:write'],
] as const

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'RPG for Developers — API Documentation',
  url: 'https://rpgcapital.com.br/developers/docs',
  about: 'RPG API and delegated merchant authorization',
  publisher: { '@type': 'Organization', name: 'RPG Capital', url: 'https://rpgcapital.com.br/' },
  inLanguage: 'pt-BR',
}

function Code({ children }: { children: string }) {
  return <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-200"><code>{children}</code></pre>
}

export default function DeveloperDocsPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/integracoes" className="font-black">RPG for Developers</Link>
          <Link href="/developers/login" className="text-sm font-bold text-blue-700">Dashboard</Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[220px_1fr]">
        <aside className="text-sm leading-8 text-slate-600 lg:sticky lg:top-6 lg:self-start">
          <a href="#inicio" className="block">Início</a>
          <a href="#autenticacao" className="block">Autenticação</a>
          <a href="#connect" className="block">RPG Connect</a>
          <a href="#scopes" className="block">Scopes</a>
          <a href="#endpoints" className="block">Endpoints</a>
          <a href="#escrita" className="block">Escrita e idempotência</a>
          <a href="#erros" className="block">Erros</a>
          <a href="#ia" className="block">IA e OpenAPI</a>
        </aside>

        <article className="min-w-0 max-w-3xl">
          <section id="inicio">
            <p className="text-sm font-bold tracking-[0.18em] text-blue-700">RPG API V1</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">RPG for Developers</h1>
            <p className="mt-4 text-lg leading-8 text-slate-600">A API da RPG permite que aplicativos autorizados leiam e escrevam dados operacionais de uma loja. O acesso é delegado pelo lojista e limitado por scopes.</p>
            <Code>{'Base URL\nhttps://rpgcapital.com.br/api/public/v1'}</Code>
          </section>

          <section id="autenticacao" className="mt-14">
            <h2 className="text-2xl font-bold">Autenticação</h2>
            <p className="mt-3 leading-7 text-slate-600">Gere uma Secret API Key no Dashboard. Ela é exibida uma única vez e começa com <code>rpg_dev_live_</code>. A chave identifica o aplicativo; ela não concede acesso a uma loja sozinha.</p>
            <Code>{'Authorization: Bearer rpg_dev_live_<prefix>_<secret>\nX-RPG-Connection-Id: <connection_uuid>'}</Code>
            <p className="mt-3 leading-7 text-slate-600">Nunca envie a Secret API Key ao navegador, ao lojista ou em uma URL. Guarde-a somente no backend do seu aplicativo.</p>
          </section>

          <section id="connect" className="mt-14">
            <h2 className="text-2xl font-bold">RPG Connect</h2>
            <p className="mt-3 leading-7 text-slate-600">RPG Connect é o fluxo de autorização delegada entre seu aplicativo e uma loja RPG. No Dashboard, gere um link de conexão escolhendo os scopes desejados. O lojista entra na RPG, escolhe a loja, revisa as permissões e autoriza somente o que desejar.</p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 leading-7 text-slate-600">
              <li>Developer cria um aplicativo.</li>
              <li>Developer gera uma Secret API Key com os scopes máximos daquela credencial.</li>
              <li>Developer gera um link de conexão com os scopes que deseja pedir.</li>
              <li>Owner/admin da loja abre o link e concede uma lista de scopes.</li>
              <li>A RPG cria um Connection ID.</li>
              <li>Em cada request, a RPG exige que o scope esteja tanto na chave quanto na conexão.</li>
            </ol>
            <Code>{'curl https://rpgcapital.com.br/api/public/v1/products \\\n  -H "Authorization: Bearer $RPG_API_KEY" \\\n  -H "X-RPG-Connection-Id: $RPG_CONNECTION_ID"'}</Code>
          </section>

          <section id="scopes" className="mt-14">
            <h2 className="text-2xl font-bold">Scopes</h2>
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50"><tr><th className="p-3">Scope</th><th className="p-3">Acesso</th></tr></thead>
                <tbody>{scopes.map(([scope, label]) => <tr key={scope} className="border-t border-slate-200"><td className="p-3"><code>{scope}</code></td><td className="p-3">{label}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section id="endpoints" className="mt-14">
            <h2 className="text-2xl font-bold">Endpoints</h2>
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50"><tr><th className="p-3">Método</th><th className="p-3">Endpoint</th><th className="p-3">Scope</th></tr></thead>
                <tbody>{endpoints.map(([method, path, scope]) => <tr key={method+path} className="border-t border-slate-200"><td className="p-3 font-bold">{method}</td><td className="p-3"><code>{path}</code></td><td className="p-3"><code>{scope}</code></td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section id="escrita" className="mt-14">
            <h2 className="text-2xl font-bold">Escrita e idempotência</h2>
            <p className="mt-3 leading-7 text-slate-600">Requests de escrita exigem <code>Idempotency-Key</code>. Use um identificador único e estável por operação. Repetir a mesma operação com a mesma chave devolve o resultado anterior; reutilizar a chave com outro conteúdo gera conflito.</p>
            <Code>{'POST /api/public/v1/imports/inventory-movements\nAuthorization: Bearer $RPG_API_KEY\nX-RPG-Connection-Id: $RPG_CONNECTION_ID\nIdempotency-Key: movement_872918'}</Code>
          </section>

          <section id="erros" className="mt-14">
            <h2 className="text-2xl font-bold">Erros</h2>
            <p className="mt-3 leading-7 text-slate-600">A API usa status HTTP e um objeto <code>error</code>. Códigos comuns: <code>invalid_api_key</code>, <code>connection_required</code>, <code>invalid_connection</code>, <code>missing_scope</code>, <code>rate_limited</code> e <code>idempotency_conflict</code>.</p>
            <Code>{'{\n  "error": {\n    "code": "missing_scope",\n    "message": "A conexão precisa da permissão inventory:write."\n  }\n}'}</Code>
          </section>

          <section id="ia" className="mt-14">
            <h2 className="text-2xl font-bold">Documentação para IA</h2>
            <p className="mt-3 leading-7 text-slate-600">Esta documentação é indexável e possui representações legíveis por máquinas. Agentes podem consultar <a className="font-semibold text-blue-700" href="/openapi.json">/openapi.json</a>, <a className="font-semibold text-blue-700" href="/llms.txt">/llms.txt</a> e <a className="font-semibold text-blue-700" href="/llms-full.txt">/llms-full.txt</a>.</p>
          </section>
        </article>
      </div>
    </main>
  )
}
