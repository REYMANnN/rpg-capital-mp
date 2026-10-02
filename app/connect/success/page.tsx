import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Integração autorizada — RPG',
  robots: { index: false, follow: false },
}

export default async function ConnectSuccessPage({ searchParams }: { searchParams: Promise<{ status?: string; connection_id?: string }> }) {
  const { status, connection_id } = await searchParams
  const ok = status === 'ok'
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-16 text-slate-950">
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-bold tracking-[0.18em] text-blue-700">RPG CONNECT</p>
        <h1 className="mt-3 text-3xl font-bold">{ok ? 'Conexão autorizada.' : 'Este link não pode mais ser usado.'}</h1>
        <p className="mt-4 leading-7 text-slate-600">{ok ? 'O aplicativo agora pode acessar apenas os dados e ações que você autorizou.' : 'Peça ao aplicativo um novo link de conexão.'}</p>
        {ok && connection_id ? <><p className="mt-5 text-sm font-semibold">Connection ID</p><code className="mt-2 block break-all rounded-xl bg-slate-950 p-4 text-xs text-white">{connection_id}</code><p className="mt-3 text-xs leading-5 text-slate-500">Você pode enviar este identificador ao aplicativo. Ele não funciona sem a chave secreta do próprio aplicativo.</p></> : null}
      </div>
    </main>
  )
}
