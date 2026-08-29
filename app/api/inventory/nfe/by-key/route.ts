import { NextRequest, NextResponse } from 'next/server'
import { DEMO_NFE_ACCESS_KEY, isValidNfeAccessKey, normalizeNfeAccessKey } from '@/lib/inventory/nfeKey'

const demoInvoice = {
  accessKey: DEMO_NFE_ACCESS_KEY,
  number: '900101',
  issuedAt: '2026-08-29T12:00:00-03:00',
  supplierName: 'DISTRIBUIDORA FICTICIA DE TESTES LTDA',
  supplierDocument: '12345678000190',
  items: [
    { line: 1, supplierCode: 'EAN-MOCA', barcode: '7891000100103', description: 'LEITE COND MOCA 395G', purchaseUnit: 'UN', quantityMilli: 12000, unitCostCents: 642, totalCents: 7704 },
    { line: 2, supplierCode: 'LOCAL-COCA', barcode: '', description: 'REFRI COCACOLA2L', purchaseUnit: 'UN', quantityMilli: 6000, unitCostCents: 720, totalCents: 4320 },
    { line: 3, supplierCode: 'KNOWN-ALIAS', barcode: '', description: 'LEITE MOCA 395G SEM GTIN', purchaseUnit: 'UN', quantityMilli: 4000, unitCostCents: 610, totalCents: 2440 },
    { line: 4, supplierCode: 'UNKNOWN-ITEM', barcode: '', description: 'BISC CHOC 90G TESTE SEM CADASTRO', purchaseUnit: 'UN', quantityMilli: 10000, unitCostCents: 280, totalCents: 2800 },
    { line: 5, supplierCode: 'CONFLICT', barcode: '7891000100103', description: 'LEITE COND MOCA 395G CONFLITO', purchaseUnit: 'UN', quantityMilli: 2000, unitCostCents: 640, totalCents: 1280 },
    { line: 6, supplierCode: 'BOX6', barcode: '', description: 'REFRI COCA COLA 2L CX C/6 UN', purchaseUnit: 'CX', quantityMilli: 2000, unitCostCents: 4200, totalCents: 8400 },
    { line: 7, supplierCode: 'BOX-UNKNOWN', barcode: '7894900011517', description: 'REFRI COCA COLA 2L CAIXA', purchaseUnit: 'CX', quantityMilli: 3000, unitCostCents: 4500, totalCents: 13500 },
    { line: 8, supplierCode: 'EAN-UNKNOWN-CATALOG', barcode: '7896004000855', description: 'PRODUTO TESTE EAN VALIDO', purchaseUnit: 'UN', quantityMilli: 5000, unitCostCents: 275, totalCents: 1375 },
  ],
}

export async function GET(request: NextRequest) {
  const key = normalizeNfeAccessKey(request.nextUrl.searchParams.get('key'))
  if (!isValidNfeAccessKey(key)) {
    return NextResponse.json({ ok: false, error: 'invalid_nfe_key' }, { status: 400 })
  }

  if (key === DEMO_NFE_ACCESS_KEY) {
    return NextResponse.json({ ok: true, demo: true, version: 'v10.3', scenarioCount: demoInvoice.items.length, invoice: demoInvoice })
  }

  return NextResponse.json({
    ok: false,
    key,
    error: 'official_xml_not_connected',
    message: 'Chave válida lida. Para recuperar os itens de uma NF-e real, o backend ainda precisa da autorização/certificado do destinatário para consultar o XML oficial. Use o XML como fallback por enquanto.',
  }, { status: 501 })
}
