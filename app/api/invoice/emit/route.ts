import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]
  const admin = createAdminClient()
  const { data: { user }, error: authError } = await admin.auth.getUser(token)

  if (authError || !user) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  try {
    const { transaction_id, merchant_id } = await request.json()

    const { data: merchant } = await admin
      .from('merchants')
      .select('nfe_focus_token, nfe_auto_emit, business_name, cnpj')
      .eq('id', merchant_id)
      .eq('user_id', user.id)
      .single()

    if (!merchant) {
      return NextResponse.json({ error: 'Lojista não encontrado' }, { status: 404 })
    }

    if (!merchant.nfe_focus_token) {
      return NextResponse.json({ error: 'Token Focus NFe não configurado' }, { status: 400 })
    }

    const { data: tx } = await admin
      .from('transactions')
      .select('*, transaction_items(*)')
      .eq('id', transaction_id)
      .single()

    if (!tx) {
      return NextResponse.json({ error: 'Transação não encontrada' }, { status: 404 })
    }

    // Call Focus NFe API
    const nfeRes = await fetch('https://homologacao.focusnfe.com.br/v2/nfce', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(merchant.nfe_focus_token + ':').toString('base64')}`,
      },
      body: JSON.stringify({
        natureza_operacao: 'Venda ao consumidor',
        data_emissao: new Date().toISOString(),
        emitente: { cnpj: merchant.cnpj, nome: merchant.business_name },
        items: (tx as any).transaction_items?.map((item: any, i: number) => ({
          numero_item: i + 1,
          descricao: item.description,
          quantidade: item.quantity,
          valor_unitario: item.unit_price,
          valor_total: item.total_price,
        })),
        pagamentos: [{ forma_pagamento: 'outros', valor: tx.amount }],
      }),
    })

    const nfeData = await nfeRes.json()

    await admin.from('invoices').insert({
      transaction_id,
      merchant_id,
      amount: (tx as any).amount,
      focus_nfe_ref: nfeData.ref || null,
      access_key: nfeData.chave_nfe || null,
      status: nfeRes.ok ? 'issued' : 'error',
      error_message: nfeRes.ok ? null : (nfeData.mensagem_erros || 'Erro ao emitir NF-e'),
    })

    return NextResponse.json({ success: nfeRes.ok, invoice: nfeData })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
