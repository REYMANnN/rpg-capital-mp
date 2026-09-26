import { createBalcaoDeepLink } from '@/lib/deeplink'
import { extractRafaInvoiceImages, extractRafaInvoiceText, type RafaInvoiceExtraction, type RafaMediaClass } from '@/lib/rafa-ai'
import { loadRafaStore } from '@/lib/inventory/rafa-store'
import { askRafaConfirmation } from '@/lib/rafa-confirm'
import { parseNfeXml } from '@/lib/inventory/nfe'
import { isNfeXml, readPdfText } from '@/lib/rafa-files'
import { buildInvoicePlan, invoicePlanMessage, priceRequestMessage, type InvoicePlanLine } from '@/lib/rafa-invoice-plan'
import { loadInvoiceProofBytes, loadInvoiceProofDataUri } from '@/lib/rafa-media'
import { listPendingProducts, markPendingAsked, savePendingProducts } from '@/lib/rafa-pending-products'
import { resolveInvoiceExtraction } from '@/lib/rafa-products'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendText } from '@/lib/whatsapp'

export function rafaClassLabel(value: RafaMediaClass) {
  if (value === 'nota_fiscal') return 'uma nota fiscal'
  if (value === 'caderno_anotacao') return 'uma anotação de caderno'
  if (value === 'planilha_print') return 'um print de planilha'
  if (value === 'print_sistema') return 'um print de sistema'
  if (value === 'foto_produto') return 'uma foto de produto'
  if (value === 'foto_prateleira') return 'uma foto de prateleira'
  return 'outro tipo de imagem'
}

export function unsupportedRafaClassMessage(value: RafaMediaClass) {
  return `Parece ${rafaClassLabel(value)}. Eu reconheço esse tipo de arquivo, mas ainda não processo isso automaticamente nesta fase. Você pode usar Prateleira e fazer a entrada manual.\n— Rafa`
}

export async function appendInvoiceMedia(input: {
  waId: string
  storeId: string
  mediaPath: string
  classification: Record<string, unknown>
}) {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data: recent } = await admin.from('rafa_invoice_imports')
    .select('id,media_paths')
    .eq('wa_id', input.waId)
    .eq('store_id', input.storeId)
    .eq('status', 'classified')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recent?.id) {
    const paths: string[] = Array.isArray(recent.media_paths)
      ? (recent.media_paths as unknown[]).filter((value): value is string => typeof value === 'string')
      : []
    const nextPaths: string[] = [...new Set([...paths, input.mediaPath])]
    const { error } = await admin.from('rafa_invoice_imports').update({
      media_paths: nextPaths,
      classification: input.classification,
      updated_at: new Date().toISOString(),
    }).eq('id', recent.id)
    if (error) throw error
    return { importId: String(recent.id), pageCount: nextPaths.length }
  }

  const { data, error } = await admin.from('rafa_invoice_imports').insert({
    wa_id: input.waId,
    store_id: input.storeId,
    media_paths: [input.mediaPath],
    classification: input.classification,
    status: 'classified',
  }).select('id').single()
  if (error) throw error
  return { importId: String(data.id), pageCount: 1 }
}

export async function processApprovedInvoiceMedia(input: {
  waId: string
  storeId: string
  importId: string
}) {
  const admin = createAdminClient()
  const { data: invoice, error } = await admin.from('rafa_invoice_imports')
    .select('*')
    .eq('id', input.importId)
    .eq('wa_id', input.waId)
    .eq('store_id', input.storeId)
    .maybeSingle()
  if (error) throw error
  if (!invoice) throw new Error('invoice_import_not_found')

  const paths: string[] = Array.isArray(invoice.media_paths)
    ? (invoice.media_paths as unknown[]).filter((value): value is string => typeof value === 'string')
    : []
  const imagePaths = paths.filter((path: string) => /\.(?:jpe?g|png|webp)$/i.test(path))
  const xmlPath = paths.find((path: string) => /\.xml$/i.test(path))
  const pdfPath = paths.find((path: string) => /\.pdf$/i.test(path))

  await admin.from('rafa_invoice_imports').update({ status: 'extracting', updated_at: new Date().toISOString() }).eq('id', invoice.id)

  // XML: leitura exata. PDF com texto: IA de texto. Foto: IA de imagem.
  let extraction: RafaInvoiceExtraction | null = null
  if (xmlPath) {
    const text = new TextDecoder('utf-8').decode(await loadInvoiceProofBytes(xmlPath))
    if (isNfeXml(text)) {
      const nfe = parseNfeXml(text)
      extraction = {
        supplier_name: nfe.supplierName || null,
        supplier_cnpj: nfe.supplierDocument || null,
        items: nfe.items.map((item) => ({
          description: item.description,
          supplier_code: item.supplierCode,
          ean: item.barcode || null,
          quantity: item.quantityMilli / 1000,
          unit_cost_cents: item.unitCostCents,
          total_cents: item.totalCents,
          unit_package: item.purchaseUnit,
          confidence: { product: 1, quantity: 1, cost: 1 },
        })),
      }
    }
  }
  if (!extraction && pdfPath) {
    const text = await readPdfText(await loadInvoiceProofBytes(pdfPath)).catch(() => '')
    if (text.length >= 30) extraction = await extractRafaInvoiceText({ storeId: input.storeId, waId: input.waId, text })
  }
  if (!extraction && imagePaths.length) {
    const dataUris = []
    for (const path of imagePaths.slice(0, 5)) dataUris.push(await loadInvoiceProofDataUri(path))
    extraction = await extractRafaInvoiceImages({ storeId: input.storeId, waId: input.waId, dataUris })
  }
  if (!extraction) {
    await admin.from('rafa_invoice_imports').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', invoice.id)
    await sendText(input.waId, 'Não consegui ler essa nota. Me manda uma foto de frente e com boa luz, o PDF ou o XML da nota.\n— Rafa')
    return { ok: false as const, reason: 'unreadable' }
  }

  const { state } = await loadRafaStore(input.storeId)
  const resolved = await resolveInvoiceExtraction(state, extraction)
  const plan = buildInvoicePlan(state, resolved.lines as InvoicePlanLine[])

  const lines = resolved.lines
  const unitCount = lines.reduce((sum: number, line: any) => sum + Math.max(0, Number(line.quantity || 0)), 0)
  const totalCostCents = lines.reduce((sum: number, line: any) => {
    const quantity = Math.max(0, Number(line.quantity || 0))
    const cost = Math.max(0, Number(line.unit_cost_cents || 0))
    return sum + Math.round(quantity * cost)
  }, 0)

  const now = new Date().toISOString()
  const { error: updateError } = await admin.from('rafa_invoice_imports').update({
    supplier_cnpj: resolved.supplier_cnpj,
    supplier_name: resolved.supplier_name,
    extraction: resolved,
    status: plan.duvidas.length ? 'pending_review' : 'ready',
    item_count: lines.length,
    unit_count: unitCount,
    total_cost_cents: totalCostCents,
    updated_at: now,
  }).eq('id', invoice.id)
  if (updateError) throw updateError

  await savePendingProducts({ storeId: input.storeId, waId: input.waId, invoiceImportId: String(invoice.id), items: plan.novos })

  // Só as dúvidas precisam de tela: o link abre a conferência dessa nota.
  let reviewLink: string | undefined
  if (plan.duvidas.length) {
    await admin.from('whatsapp_sessions').update({
      fluxo_atual: 'prateleira',
      etapa: 'conferencia_nota',
      payload: { invoice_import_id: invoice.id },
      updated_at: now,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }).eq('wa_id', input.waId)
    const link = await createBalcaoDeepLink({ waId: input.waId, storeId: input.storeId, fluxo: 'prateleira' })
    reviewLink = link.url
  }

  const message = `${invoicePlanMessage(plan, resolved.supplier_name, reviewLink)}\n— Rafa`
  if (plan.entradas.length) {
    // Sim/Não para as entradas; o pedido de preço dos novos vem logo depois do Sim.
    const sent = await askRafaConfirmation({ waId: input.waId, storeId: input.storeId, changes: plan.entradas, state, message })
    if (!sent.ok) throw new Error(sent.error)
  } else {
    const sent = await sendText(input.waId, message)
    if (!sent.ok) throw new Error(sent.error)
    await askPendingPrices(input.waId, input.storeId)
  }

  return { ok: true as const, importId: String(invoice.id), itemCount: lines.length, exceptionCount: plan.duvidas.length }
}

// Pede o preço de venda dos produtos novos que ainda não foram perguntados.
export async function askPendingPrices(waId: string, storeId: string, options: { force?: boolean } = {}) {
  const pending = await listPendingProducts(storeId)
  const toAsk = options.force ? pending : pending.filter((row) => !row.asked_at)
  if (!toAsk.length) return false
  const sent = await sendText(waId, `${priceRequestMessage(pending)}\n— Rafa`)
  if (!sent.ok) throw new Error(sent.error)
  await markPendingAsked(pending.map((row) => row.id))
  return true
}
