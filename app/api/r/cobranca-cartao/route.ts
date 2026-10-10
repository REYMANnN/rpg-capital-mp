import { NextResponse, type NextRequest } from 'next/server'

import { waLinkStore } from '@/lib/sumup/access'
import { cancelCardCharge, chargeStatus, createCardCharge, listReaders, settleCharge } from '@/lib/sumup/charges'
import { sumupConnected } from '@/lib/sumup/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Link de vender (/r/vender): manda a venda pra maquininha Solo da loja.

// GET sem id: a loja tem maquininha? GET com id: status da cobrança.
export async function GET(request: NextRequest) {
  const session = await waLinkStore(request)
  if (!session) return NextResponse.json({ error: 'wa_session_ended' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id') || ''
  if (!id) {
    const [connected, readers] = await Promise.all([sumupConnected(session.storeId), listReaders(session.storeId)])
    return NextResponse.json({ ok: true, enabled: connected && readers.length > 0, readers: readers.map((row) => ({ id: row.id, name: row.name })) })
  }
  if (!UUID.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  let row = await chargeStatus(id, session.storeId)
  if (!row) return NextResponse.json({ error: 'Cobrança não encontrada.' }, { status: 404 })
  // Rede de segurança: se o webhook atrasar, confere direto na SumUp depois de 20 s.
  if (row.status === 'processing') {
    const age = Date.now() - new Date(String(row.created_at || Date.now())).getTime()
    if (age > 20_000) {
      await settleCharge(id).catch(() => null)
      row = await chargeStatus(id, session.storeId) || row
    }
  }
  return NextResponse.json({
    ok: true,
    status: row.status,
    amountCents: row.amount_cents,
    cardLast4: row.card_last4,
    cardScheme: row.card_scheme,
    failureReason: row.failure_reason,
    saleRegistered: Boolean(row.inventory_finalized_at),
    inventoryError: row.inventory_error,
  })
}

export async function POST(request: NextRequest) {
  const session = await waLinkStore(request)
  if (!session) return NextResponse.json({ error: 'wa_session_ended' }, { status: 401 })
  const body = await request.json().catch(() => null) as {
    cardType?: unknown; installments?: unknown; items?: unknown; readerId?: unknown
  } | null
  const cardType = body?.cardType === 'credito' || body?.cardType === 'debito' ? body.cardType : null
  if (!cardType) return NextResponse.json({ error: 'Escolha crédito ou débito.' }, { status: 400 })
  const items = Array.isArray(body?.items)
    ? (body!.items as Array<{ productId?: unknown; quantityMilli?: unknown }>)
      .map((item) => ({ productId: String(item.productId || ''), quantityMilli: Math.round(Number(item.quantityMilli || 0)) }))
      .filter((item) => item.productId && item.quantityMilli > 0)
    : []
  if (!items.length) return NextResponse.json({ error: 'Carrinho vazio.' }, { status: 400 })

  try {
    // O valor sai do preço do catálogo no servidor (o navegador não define quanto cobrar).
    const result = await createCardCharge({
      storeId: session.storeId,
      cardType,
      installments: Number(body?.installments || 1),
      items,
      description: 'Venda no Caixa',
      source: 'site',
      waId: session.waId,
      readerId: typeof body?.readerId === 'string' ? body.readerId : undefined,
    })
    if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.code === 'invalid' ? 400 : 409 })
    return NextResponse.json({ ok: true, chargeId: result.chargeId, amountCents: result.amountCents, readerName: result.readerName })
  } catch (error) {
    console.error('card charge failed', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Não consegui mandar pra maquininha agora. Tente de novo.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await waLinkStore(request)
  if (!session) return NextResponse.json({ error: 'wa_session_ended' }, { status: 401 })
  const result = await cancelCardCharge(session.storeId).catch((error) => ({ ok: false as const, error: error instanceof Error ? error.message : 'erro' }))
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: 409 })
}
