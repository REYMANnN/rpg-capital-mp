import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { buildStaticPixPayload } from '@/lib/payments/pix'
import {
  hashSecret,
  INVENTORY_INSTALLATION_COOKIE,
  STAFF_SESSION_COOKIE,
  TERMINAL_COOKIE,
  unpackCredential,
} from '@/lib/accounts/terminal'

type PixMerchantContext = {
  pixKey: string
  merchantName: string
  merchantCity: string
}

export async function POST(request: NextRequest) {
  try {
    return await handlePixRequest(request)
  } catch (cause) {
    console.error('BALCAO checkout Pix unexpected failure', cause instanceof Error
      ? { name: cause.name, message: cause.message }
      : { cause: String(cause) })

    return NextResponse.json({
      error: 'Não foi possível gerar o QR Pix porque o servidor encontrou um erro interno. O total da venda e a chave Pix cadastrada não foram alterados. Tente novamente.',
    }, { status: 500 })
  }
}

async function handlePixRequest(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const amountCents = Number(body?.amountCents)
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_000) {
    return NextResponse.json({
      error: 'O Caixa enviou um valor inválido para a cobrança Pix. Revise os itens da venda e tente novamente.',
    }, { status: 400 })
  }

  const supabase = await createServerClient()
  const terminal = unpackCredential(request.cookies.get(TERMINAL_COOKIE)?.value)
  const session = unpackCredential(request.cookies.get(STAFF_SESSION_COOKIE)?.value)

  // Funcionários do Caixa usam a função SECURITY DEFINER existente, que valida
  // terminal, sessão e a permissão checkout.sell sem expor a chave Pix ao cliente.
  if (terminal && session) {
    const { data, error } = await supabase.rpc('balcao_checkout_pix_context', {
      p_terminal_id: terminal.id,
      p_terminal_hash: hashSecret(terminal.secret),
      p_session_id: session.id,
      p_session_hash: hashSecret(session.secret),
    })

    if (error) {
      console.error('BALCAO checkout Pix staff context failed', { code: error.code })
      return NextResponse.json({
        error: 'Não foi possível validar sua sessão do Caixa para gerar o Pix. Saia e entre novamente no Caixa e tente outra vez.',
      }, { status: 500 })
    }

    const staffContext = Array.isArray(data) ? data[0] : data
    if (staffContext) {
      if (!staffContext.pix_key) {
        return NextResponse.json({
          error: 'A loja não retornou uma chave Pix. Essa chave deveria ter sido salva no onboarding; confirme a chave Pix nas configurações da empresa.',
        }, { status: 409 })
      }

      return createPixResponse({
        pixKey: String(staffContext.pix_key),
        merchantName: String(staffContext.merchant_name || 'BALCAO'),
        merchantCity: String(staffContext.merchant_city || 'BRASIL'),
      }, amountCents)
    }
  }

  // Proprietário/administrador/gerente autenticado pode abrir o mesmo Caixa sem
  // sessão de funcionário. As políticas RLS só devolvem lojas da própria empresa.
  const installationId = request.cookies.get(INVENTORY_INSTALLATION_COOKIE)?.value?.trim()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData.user) {
    if (terminal || session) {
      return NextResponse.json({
        error: 'Sua sessão do Caixa não pôde ser validada ou seu perfil não possui permissão para cobrar vendas. Entre novamente com o funcionário correto.',
      }, { status: 403 })
    }
    return NextResponse.json({
      error: 'Sua sessão expirou. Entre novamente no BALCÃO antes de gerar a cobrança Pix.',
    }, { status: 401 })
  }

  if (!installationId) {
    return NextResponse.json({
      error: 'Não foi possível identificar qual loja está aberta no Caixa. Volte à tela inicial, abra a loja novamente e tente gerar o Pix.',
    }, { status: 409 })
  }

  const { data: store, error: storeError } = await supabase
    .from('inventory_v1_stores')
    .select('id, business_id, display_name, city')
    .eq('installation_id', installationId)
    .eq('active', true)
    .maybeSingle()

  if (storeError) {
    console.error('BALCAO checkout Pix store lookup failed', { code: storeError.code })
    return NextResponse.json({
      error: 'Não foi possível carregar os dados da loja para gerar o QR Pix. A venda não foi concluída; tente novamente.',
    }, { status: 500 })
  }

  if (!store?.business_id) {
    return NextResponse.json({
      error: 'Sua conta está autenticada, mas não possui acesso à loja que está aberta no Caixa. Abra uma loja da sua empresa e tente novamente.',
    }, { status: 403 })
  }

  const { data: business, error: businessError } = await supabase
    .from('balcao_businesses')
    .select('display_name, pix_key')
    .eq('id', store.business_id)
    .eq('active', true)
    .maybeSingle()

  if (businessError) {
    console.error('BALCAO checkout Pix business lookup failed', { code: businessError.code })
    return NextResponse.json({
      error: 'Não foi possível carregar a configuração Pix da empresa. A venda não foi concluída; tente novamente.',
    }, { status: 500 })
  }

  if (!business?.pix_key) {
    return NextResponse.json({
      error: 'Não encontrei a chave Pix desta empresa. Ela deveria ter sido salva no onboarding; confirme a chave Pix nas configurações da empresa.',
    }, { status: 409 })
  }

  return createPixResponse({
    pixKey: String(business.pix_key),
    merchantName: String(business.display_name || store.display_name || 'BALCAO'),
    merchantCity: String(store.city || 'BRASIL'),
  }, amountCents)
}

async function createPixResponse(context: PixMerchantContext, amountCents: number) {
  try {
    const payload = buildStaticPixPayload({
      pixKey: context.pixKey,
      amountCents,
      merchantName: context.merchantName,
      merchantCity: context.merchantCity,
    })
    const qrDataUrl = await QRCode.toDataURL(payload, {
      width: 420,
      margin: 2,
      errorCorrectionLevel: 'M',
    })

    return NextResponse.json({ ok: true, amountCents, payload, qrDataUrl })
  } catch {
    return NextResponse.json({
      error: 'A chave Pix cadastrada foi encontrada, mas não é válida para montar esta cobrança. Confira a chave Pix nas configurações da empresa.',
    }, { status: 422 })
  }
}
