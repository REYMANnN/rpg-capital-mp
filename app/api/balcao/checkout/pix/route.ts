import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { authorizeInventoryContext } from '@/lib/accounts/requestContext'
import { INVENTORY_INSTALLATION_COOKIE, STAFF_SESSION_COOKIE, TERMINAL_COOKIE } from '@/lib/accounts/terminal'
import { buildStaticPixPayload } from '@/lib/payments/pix'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const amountCents = Number(body?.amountCents)
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_000) {
    return NextResponse.json({ error: 'Informe um valor válido para a cobrança Pix.' }, { status: 400 })
  }

  const context = await authorizeInventoryContext({
    installationId: request.cookies.get(INVENTORY_INSTALLATION_COOKIE)?.value,
    terminalCookie: request.cookies.get(TERMINAL_COOKIE)?.value,
    staffCookie: request.cookies.get(STAFF_SESSION_COOKIE)?.value,
  })

  if (!context.authorized || !context.store) {
    return NextResponse.json({ error: 'Entre para cobrar no Pix.' }, { status: 401 })
  }
  if (context.mode === 'staff' && !context.staff?.permissions.has('checkout.sell')) {
    return NextResponse.json({ error: 'Seu perfil não tem acesso ao Caixa.' }, { status: 403 })
  }

  const admin = createAdminClient()
  const [{ data: business, error: businessError }, { data: store, error: storeError }] = await Promise.all([
    admin
      .from('balcao_businesses')
      .select('display_name, pix_key')
      .eq('id', context.store.business_id)
      .eq('active', true)
      .maybeSingle(),
    admin
      .from('inventory_v1_stores')
      .select('city')
      .eq('id', context.store.id)
      .eq('active', true)
      .maybeSingle(),
  ])

  if (businessError || storeError) {
    console.error('BALCAO checkout Pix context failed', {
      businessCode: businessError?.code,
      storeCode: storeError?.code,
    })
    return NextResponse.json({ error: 'Não conseguimos preparar a cobrança Pix agora.' }, { status: 500 })
  }
  if (!business?.pix_key) {
    return NextResponse.json({ error: 'Esta loja ainda não possui uma chave Pix configurada.' }, { status: 409 })
  }

  try {
    const payload = buildStaticPixPayload({
      pixKey: String(business.pix_key),
      amountCents,
      merchantName: String(business.display_name || context.store.display_name || 'BALCAO'),
      merchantCity: String(store?.city || 'BRASIL'),
    })
    const qrDataUrl = await QRCode.toDataURL(payload, {
      width: 420,
      margin: 2,
      errorCorrectionLevel: 'M',
    })

    return NextResponse.json({ ok: true, amountCents, payload, qrDataUrl })
  } catch {
    return NextResponse.json({ error: 'A chave Pix cadastrada não pôde gerar uma cobrança.' }, { status: 422 })
  }
}
