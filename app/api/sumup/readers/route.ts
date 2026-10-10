import { NextResponse } from 'next/server'

import { managerStore } from '@/lib/sumup/access'
import { listReaders, pairReader } from '@/lib/sumup/charges'
import { SumUpError } from '@/lib/sumup/client'

export const dynamic = 'force-dynamic'

// Parear a Solo pelo site (código que aparece na tela dela).
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { storeId?: unknown; code?: unknown; name?: unknown }
  const storeId = typeof body.storeId === 'string' ? body.storeId : ''
  const { user, store } = await managerStore(storeId)
  if (!user) return NextResponse.json({ error: 'Entre com sua conta Google.' }, { status: 401 })
  if (!store) return NextResponse.json({ error: 'Sem acesso a essa loja.' }, { status: 403 })
  try {
    const result = await pairReader(store.id, String(body.code || ''), typeof body.name === 'string' ? body.name : undefined)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
    return NextResponse.json({ ok: true, reader: { id: result.reader.id, name: result.reader.name }, readers: await listReaders(store.id) })
  } catch (error) {
    const message = error instanceof SumUpError && error.code === 'not_connected' ? 'Conecte a conta SumUp antes.' : 'Não consegui parear agora. Tente de novo.'
    console.error('sumup pair failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
