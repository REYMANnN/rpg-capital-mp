import assert from 'node:assert/strict'
import test from 'node:test'

import { analyzeMoneyFlow, counterpartyFromDescription, enrichTransaction } from '../../lib/finance/enrich.ts'

test('contraparte sai da descrição do extrato', () => {
  assert.equal(counterpartyFromDescription('OXXO OLIMPIA           SAO PAULO     BRA', 'CARTAO'), 'Oxxo Olimpia')
  assert.equal(counterpartyFromDescription('IFD*ZAMP S.A.          SAO PAULO     BRA', 'CARTAO'), 'iFood · Zamp S.A.')
  assert.equal(counterpartyFromDescription('VMT*NUTRICAR           SANTANA DE PA BRA', 'CARTAO'), 'Nutricar')
  assert.equal(counterpartyFromDescription('Pix enviado para KEETA DELIVERY BRAZIL LTDA', 'PIX'), 'Keeta Delivery Brazil LTDA')
  assert.equal(counterpartyFromDescription('Pix recebido c6 de ANDRE OLIVEIRA DE GUADALUPE', 'PIX'), 'Andre Oliveira de Guadalupe')
  assert.equal(counterpartyFromDescription('Devol recebida pix de PIX Marketplace', 'PIX'), 'Pix Marketplace')
  assert.equal(counterpartyFromDescription('57.114.756 RENAN PANGONI GUADALUPE', 'PIX'), 'Renan Pangoni Guadalupe')
  assert.equal(counterpartyFromDescription('Pix enviado para 30.223.659 WAGNER PEREIRA MACHADO', 'PIX'), 'Wagner Pereira Machado')
  assert.equal(counterpartyFromDescription('DEBITO DE CARTAO ', 'CARTAO'), null)
  assert.equal(counterpartyFromDescription('PIX RECEBIDO C6', 'PIX'), null)
  assert.equal(counterpartyFromDescription('3723 - GRSA GR CLUB CR SAO PAULO     BRA', 'CARTAO'), 'Grsa Gr Club Cr')
})

test('grupos: maquininha, dono, contas, impostos, tarifas, fornecedor, pessoas', () => {
  const owners = ['RENAN PANGONI GUADALUPE']
  const group = (amountCents: number, description: string, transactionType = 'PIX', category = '') =>
    enrichTransaction({ amountCents, description, transactionType, category }, owners).group
  assert.equal(group(152000, 'TED RECEBIDA STONE PAGAMENTOS SA', 'TED'), 'vendas_maquininha')
  assert.equal(group(80000, 'PIX RECEBIDO DE CIELO SA'), 'vendas_maquininha')
  assert.equal(group(-5000, '57.114.756 RENAN PANGONI GUADALUPE'), 'retirada_do_dono')
  assert.equal(group(5000, 'Pix recebido de 57.114.756 RENAN PANGONI GUADALUPE'), 'transferencia_propria')
  assert.equal(group(-9629, 'Pix enviado para ENEL DISTRIBUICAO SAO PAULO'), 'contas_fixas')
  assert.equal(group(-45000, 'PAGAMENTO DAS SIMPLES NACIONAL', 'BOLETO'), 'impostos')
  assert.equal(group(-1000, 'SEGURO CONTA C6 ', 'OUTROS', 'Seguros'), 'tarifas_e_juros')
  assert.equal(group(-230000, 'Pix enviado para ATACADAO DISTRIBUIDORA LTDA'), 'fornecedores')
  assert.equal(group(-18750, 'Pix enviado para 30.223.659 WAGNER PEREIRA MACHADO'), 'folha_e_servicos')
  assert.equal(group(-5400, 'BALUARTEFOODS          SAO PAULO     BRA', 'CARTAO'), 'compras_no_cartao')
  assert.equal(group(63652, 'RESGATE CDB YELLOW', 'RESGATE_APLIC_FINANCEIRA', 'Investimentos'), 'investimentos')
  assert.equal(group(18500, 'Pix recebido de Lucas Verdadeiro Candolo'), 'recebimentos_pix')
})

test('resumo do fluxo: origens, destinos, recorrentes e conciliação', () => {
  const flow = analyzeMoneyFlow({
    ownerNames: ['Renan Pangoni Guadalupe'],
    transactions: [
      { postedAt: '2026-08-02', amountCents: 150000, description: 'TED RECEBIDA STONE PAGAMENTOS SA', transactionType: 'TED' },
      { postedAt: '2026-09-02', amountCents: 170000, description: 'TED RECEBIDA STONE PAGAMENTOS SA', transactionType: 'TED' },
      { postedAt: '2026-09-03', amountCents: 20000, description: 'Pix recebido de Maria Cliente', transactionType: 'PIX' },
      { postedAt: '2026-08-05', amountCents: -9000, description: 'Pix enviado para ENEL DISTRIBUICAO SAO PAULO', transactionType: 'PIX' },
      { postedAt: '2026-09-05', amountCents: -9600, description: 'Pix enviado para ENEL DISTRIBUICAO SAO PAULO', transactionType: 'PIX' },
      { postedAt: '2026-09-06', amountCents: -120000, description: 'Pix enviado para ATACADAO DISTRIBUIDORA LTDA', transactionType: 'PIX' },
      { postedAt: '2026-09-07', amountCents: -3000, description: 'DEBITO DE CARTAO ', transactionType: 'CARTAO' },
    ],
    sales: { cardCents: 180000, pixCents: 25000, cashCents: 5000 },
    invoiceSuppliers: [{ name: 'Atacadão Distribuidora', totalCents: 125000 }],
  })
  assert.equal(flow.inflowCents, 340000)
  assert.equal(flow.topSources[0].name, 'Stone')
  assert.equal(flow.topDestinations[0].name, 'Atacadao Distribuidora LTDA')
  assert.equal(flow.inflowByGroup[0].group, 'vendas_maquininha')
  assert.deepEqual(flow.recurring.map((item) => item.name), ['Enel Distribuicao Sao Paulo'])
  assert.equal(flow.reconciliation?.cardReceivedCents, 320000)
  assert.equal(flow.supplierPayments[0].paidCents, -120000)
  assert.ok(flow.identifiedOutShare >= 97)
})
