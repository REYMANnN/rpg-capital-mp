import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

import { BALCAO_SESSION_COOKIE, verifyBalcaoSessionToken } from '@/lib/deeplink'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSupabaseUrl } from '@/lib/supabase/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type CardLine = {
  productId: string
  quantityMilli: number
}

function validLines(value: unknown): value is CardLine[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) return false
  return value.every((line) => {
    if (!line || typeof line !== 'object') return false
    const row = line as Record<string, unknown>
    return typeof row.productId === 'string'
      && UUID.test(row.productId)
      && Number.isInteger(row.quantityMilli)
      && Number(row.quantityMilli) > 0
  })
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(BALCAO_SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ ok: false, error: 'Abra a venda pelo botão Vender da Rafa.' }, { status: 401 })

  let claims
  try {
    claims = await verifyBalcaoSessionToken(token)
  } catch {
    return NextResponse.json({ ok: false, error: 'Este link da Rafa não vale mais. Peça um novo.' }, { status: 401 })
  }
  if (!claims.store_id || claims.fluxo !== 'vender') {
    return NextResponse.json({ ok: false, error: 'Abra a venda pelo botão Vender da Rafa.' }, { status: 400 })
  }

  const body = await request.json().catch(() => null) as { items?: unknown } | null
  const lines = body?.items
  if (!validLines(lines)) {
    return NextResponse.json({ ok: false, error: 'Carrinho inválido.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const now = Date.now()
  const [{ data: session }, { data: store }, { data: merchant }, { count: devices }] = await Promise.all([
    admin.from('whatsapp_sessions')
      .select('wa_id,store_id,fluxo_atual,expires_at,payload')
      .eq('wa_id', claims.wa_id)
      .eq('store_id', claims.store_id)
      .maybeSingle(),
    admin.from('inventory_v1_stores')
      .select('id,installation_id,display_name,active')
      .eq('id', claims.store_id)
      .eq('active', true)
      .maybeSingle(),
    admin.from('rpg_tap_merchants')
      .select('status')
      .eq('store_id', claims.store_id)
      .maybeSingle(),
    admin.from('rpg_tap_devices')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', claims.store_id)
      .is('revoked_at', null),
  ])

  const sessionJti = (session?.payload as Record<string, unknown> | null)?.jti
  if (!session || session.fluxo_atual !== 'vender' || new Date(session.expires_at).getTime() <= now || (typeof sessionJti === 'string' && sessionJti !== claims.jti)) {
    return NextResponse.json({ ok: false, error: 'A Rafa já abriu outra operação. Use o link mais novo.' }, { status: 401 })
  }
  if (!store?.installation_id) return NextResponse.json({ ok: false, error: 'Loja não encontrada.' }, { status: 404 })

  const setupUrl = `/ativar-cartao?loja=${encodeURIComponent(claims.store_id)}`
  if (merchant?.status !== 'active') {
    return NextResponse.json({ ok: false, code: 'tap_not_connected', error: 'Ative o cartão na RPG antes de cobrar.', setupUrl }, { status: 409 })
  }
  if (!devices) {
    return NextResponse.json({ ok: false, code: 'tap_device_missing', error: 'Instale e conecte o aplicativo RPG neste Android antes de cobrar.', setupUrl }, { status: 409 })
  }

  const { data: snapshot, error: stateError } = await admin.rpc('inventory_v1_get_state', { p_installation_id: store.installation_id })
  if (stateError || !snapshot?.found || !snapshot?.state) {
    return NextResponse.json({ ok: false, error: 'Não foi possível carregar o estoque desta loja.' }, { status: 500 })
  }

  const products = Array.isArray(snapshot.state.products) ? snapshot.state.products as Array<Record<string, unknown>> : []
  const byId = new Map(products.map((product) => [String(product.id), product]))
  let amountCents = 0
  for (const line of lines) {
    const product = byId.get(line.productId)
    const price = Math.round(Number(product?.priceCents ?? 0))
    const stock = Math.round(Number(product?.stockMilli ?? 0))
    if (!product || product.deletedAt) {
      return NextResponse.json({ ok: false, error: 'Um produto do carrinho não está mais disponível.' }, { status: 409 })
    }
    if (price <= 0) return NextResponse.json({ ok: false, error: `${String(product.name || 'Produto')}: defina o preço antes de cobrar.` }, { status: 409 })
    if (stock < line.quantityMilli) return NextResponse.json({ ok: false, error: `Estoque insuficiente para ${String(product.name || 'um produto')}.` }, { status: 409 })
    amountCents += Math.round(price * line.quantityMilli / 1000)
  }
  if (amountCents < 100) return NextResponse.json({ ok: false, error: 'Valor mínimo no cartão: R$ 1,00.' }, { status: 400 })

  const saleId = randomUUID()
  const salePayload = {
    saleId,
    movementIds: lines.map(() => randomUUID()),
    items: lines,
    jti: claims.jti,
  }

  const { data: charge, error: chargeError } = await admin.from('rpg_tap_charges').insert({
    store_id: claims.store_id,
    amount_cents: amountCents,
    description: `Venda RPG · ${store.display_name || 'Loja'}`,
    source: 'rafa',
    requested_by_wa_id: claims.wa_id,
    sale_id: saleId,
    sale_payload: salePayload,
  }).select('id,amount_cents,expires_at').single()

  if (chargeError || !charge) {
    console.error('RPG Tap charge create failed', { code: chargeError?.code })
    return NextResponse.json({ ok: false, error: 'Não foi possível iniciar o pagamento no cartão.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    chargeId: charge.id,
    amountCents: charge.amount_cents,
    expiresAt: charge.expires_at,
    link: `${getSupabaseUrl()}/functions/v1/rpg-tap/c/${charge.id}`,
  })
}
