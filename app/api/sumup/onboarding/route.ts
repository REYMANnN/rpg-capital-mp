import { NextResponse } from 'next/server'

import { managerStore, setSumUpOnboarding } from '@/lib/sumup/access'

export const dynamic = 'force-dynamic'

// Guarda a escolha da etapa "maquininha" (criando conta / conectar depois).
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { storeId?: unknown; status?: unknown }
  const storeId = typeof body.storeId === 'string' ? body.storeId : ''
  const status = body.status === 'signing_up' || body.status === 'skipped' ? body.status : null
  if (!storeId || !status) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  const { user, store } = await managerStore(storeId)
  if (!user) return NextResponse.json({ error: 'Entre com sua conta Google.' }, { status: 401 })
  if (!store) return NextResponse.json({ error: 'Sem acesso a essa loja.' }, { status: 403 })
  await setSumUpOnboarding(store.id, status)
  return NextResponse.json({ ok: true })
}
