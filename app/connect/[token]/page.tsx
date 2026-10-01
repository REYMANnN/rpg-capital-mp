import { createHash } from 'node:crypto'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getManagementContext } from '@/lib/accounts/currentUser'

export const metadata: Metadata = {
  title: 'Autorizar integração — RPG',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const SCOPE_COPY: Record<string, { title: string; description: string; level: 'read' | 'write' }> = {
  'products:read': { title: 'Ler produtos', description: 'Consultar cadastro, códigos, preços e informações dos produtos.', level: 'read' },
  'products:write': { title: 'Editar produtos', description: 'Criar e alterar cadastros de produtos.', level: 'write' },
  'inventory:read': { title: 'Ler estoque', description: 'Consultar quantidades e movimentações de estoque.', level: 'read' },
  'inventory:write': { title: 'Editar estoque', description: 'Registrar entradas, saídas e ajustes de estoque.', level: 'write' },
  'sales:read': { title: 'Ler vendas', description: 'Consultar vendas e itens vendidos.', level: 'read' },
  'sales:ingest': { title: 'Registrar vendas', description: 'Enviar vendas para a RPG e movimentar os dados relacionados.', level: 'write' },
  'finance:read': { title: 'Ler financeiro', description: 'Consultar contas, transações e dados financeiros disponíveis.', level: 'read' },
  'pricing:read': { title: 'Ler preços', description: 'Consultar histórico e recomendações de preço.', level: 'read' },
  'pricing:write': { title: 'Alterar preços', description: 'Aplicar alterações e recomendações de preço.', level: 'write' },
  'webhooks:manage': { title: 'Gerenciar webhooks', description: 'Configurar recebimento de eventos da RPG.', level: 'write' },
}

function hashToken(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export default async function ConnectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const admin = createAdminClient()
  const { data: connection } = await admin
    .from('rpg_developer_connection_requests')
    .select('id,app_id,requested_scopes,external_reference,status,expires_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle()

  if (!connection || connection.status !== 'pending' || new Date(connection.expires_at).getTime() <= Date.now()) {
    return <main className="min-h-screen bg-slate-50 px-5 py-16"><div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8"><h1 className="text-2xl font-bold">Este link não está mais disponível.</h1><p className="mt-3 text-slate-600">Peça ao aplicativo um novo link de conexão.</p></div></main>
  }

  const { data: app } = await admin.from('rpg_developer_apps').select('id,name,website_url,status').eq('id', connection.app_id).maybeSingle()
  if (!app || app.status !== 'active') {
    return <main className="min-h-screen bg-slate-50 px-5 py-16"><div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8"><h1 className="text-2xl font-bold">Aplicativo indisponível.</h1></div></main>
  }

  const user = await getCurrentUser()
  if (!user) redirect(`/login?intent=login&next=${encodeURIComponent(`/connect/${token}`)}`)

  const businesses = (await getManagementContext(user.id)).filter((business) => business.role === 'owner' || business.role === 'admin')
  const stores = businesses.flatMap((business) => business.stores.map((store) => ({ ...store, businessName: business.displayName })))

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-bold tracking-[0.18em] text-blue-700">RPG CONNECT</p>
        <h1 className="mt-3 text-3xl font-bold">{app.name} quer se conectar à sua loja.</h1>
        <p className="mt-3 leading-7 text-slate-600">Escolha a loja e revise cada acesso. Você pode retirar permissões antes de autorizar.</p>

        {!stores.length ? (
          <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <strong>Você precisa ser proprietário ou administrador de uma loja RPG para autorizar esta integração.</strong>
          </section>
        ) : (
          <form action="/api/connect/authorize" method="post" className="mt-8 grid gap-6">
            <input type="hidden" name="token" value={token} />

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <label className="text-sm font-bold" htmlFor="store_id">Loja</label>
              <select id="store_id" name="store_id" required className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3">
                {stores.map((store) => <option key={store.id} value={store.id}>{store.businessName} — {store.displayName}</option>)}
              </select>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-bold">Permissões solicitadas</h2>
              <div className="mt-4 grid gap-3">
                {(connection.requested_scopes as string[]).map((scope) => {
                  const copy = SCOPE_COPY[scope] ?? { title: scope, description: 'Permissão da API RPG.', level: scope.includes('write') ? 'write' : 'read' as const }
                  return (
                    <label key={scope} className="flex gap-3 rounded-xl border border-slate-200 p-4">
                      <input type="checkbox" name="scopes" value={scope} defaultChecked className="mt-1" />
                      <span>
                        <span className="flex items-center gap-2"><strong>{copy.title}</strong><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${copy.level === 'write' ? 'bg-amber-100 text-amber-900' : 'bg-blue-50 text-blue-800'}`}>{copy.level === 'write' ? 'EDITAR' : 'LER'}</span></span>
                        <span className="mt-1 block text-sm leading-6 text-slate-600">{copy.description}</span>
                        <code className="mt-1 block text-xs text-slate-400">{scope}</code>
                      </span>
                    </label>
                  )
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="text-sm leading-6 text-slate-600">Ao autorizar, o aplicativo receberá um <strong>Connection ID</strong>. Ele só funcionará com uma chave do próprio aplicativo e somente para as permissões marcadas acima.</p>
              <button type="submit" className="mt-5 w-full rounded-xl bg-blue-700 px-5 py-3.5 font-bold text-white hover:bg-blue-800">Autorizar conexão</button>
            </section>
          </form>
        )}
      </div>
    </main>
  )
}
