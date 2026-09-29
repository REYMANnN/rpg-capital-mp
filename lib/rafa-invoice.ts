import { createBalcaoDeepLink } from '@/lib/deeplink'
import { extractRafaInvoiceImages, extractRafaInvoiceText, type RafaInvoiceExtraction, type RafaMediaClass } from '@/lib/rafa-ai'
import { loadRafaStore } from '@/lib/inventory/rafa-store'
import { mergeInvoiceExtractions } from '@/lib/rafa-ai-parse'
import { askRafaConfirmation } from '@/lib/rafa-confirm'
import { checkInvoice } from '@/lib/rafa-invoice-check'
import { prepareInvoiceImages } from '@/lib/rafa-invoice-image'
import { parseNfeXml } from '@/lib/inventory/nfe'
import { isNfeXml, readPdfText } from '@/lib/rafa-files'
import { buildInvoicePlan, invoicePlanMessage, type InvoicePlanLine } from '@/lib/rafa-invoice-plan'
import { loadInvoiceProofBytes, loadInvoiceProofDataUri } from '@/lib/rafa-media'
import { resolveNamesToEan } from '@/lib/rafa-name-ean'
import { savePendingProducts } from '@/lib/rafa-pending-products'
import { startPriceQuestions } from '@/lib/rafa-price-questions'
import { isValidGtin } from '@/lib/whatsapp-router'
import { resolveInvoiceExtraction } from '@/lib/rafa-products'
import { commitRafaChanges } from '@/lib/rafa-ops'
import { recordRafaEvent } from '@/lib/rafa-events'
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

async function extractInvoicePhotos(input: {
  waId: string
  storeId: string
  imagePaths: string[]
  operation?: string
  recheckMessage?: string
}): Promise<RafaInvoiceExtraction> {
  const tileMode = process.env.RAFA_INVOICE_TILES !== 'off'
  const groups: string[][] = []
  for (const path of input.imagePaths.slice(0, 5)) {
    if (tileMode) groups.push(await prepareInvoiceImages(await loadInvoiceProofBytes(path)))
    else groups.push([await loadInvoiceProofDataUri(path)])
  }
  const totalImages = groups.reduce((sum, group) => sum + group.length, 0)
  const parts: RafaInvoiceExtraction[] = []
  const call = (dataUris: string[], tiled: boolean) => extractRafaInvoiceImages({
    storeId: input.storeId,
    waId: input.waId,
    dataUris,
    operation: input.operation,
    tiled,
    recheckMessage: input.recheckMessage,
  })

  if (totalImages <= 3 && (groups.length === 1 || groups.every((group) => group.length === 1))) {
    parts.push(await call(groups.flat(), groups.length === 1 && groups[0].length > 1))
  } else {
    // Se as faixas ultrapassarem o limite do qwen3.8, cada foto vira uma chamada de até 3 imagens.
    for (const group of groups) parts.push(await call(group.slice(0, 3), group.length > 1))
  }
  return mergeInvoiceExtractions(parts)
}

function recheckMessage(extraction: RafaInvoiceExtraction, check: ReturnType<typeof checkInvoice>) {
  const notes: string[] = []
  if (check.sumDiffPct > 1 && check.printedTotalCents != null) {
    notes.push(`Na leitura anterior a soma das linhas deu ${(check.sumCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} e o total impresso é ${(check.printedTotalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`)
  }
  if (check.countMismatch) notes.push(`A leitura anterior trouxe ${extraction.items.length} linhas, mas a nota indica ${extraction.printed_item_count}.`)
  if (check.cnpjValid === false) notes.push(`O CNPJ lido ${extraction.supplier_cnpj || ''} não fecha o dígito verificador.`)
  return `${notes.join(' ')} Releia com atenção cada linha e o CNPJ.`.trim()
}

function applyInvoiceChecks(extraction: RafaInvoiceExtraction) {
  const checked = checkInvoice(extraction)
  return {
    extraction: {
      ...extraction,
      supplier_cnpj_valid: checked.cnpjValid,
      items: extraction.items.map((item, index) => {
        const result = checked.lineResults[index]
        if (!result || result.ok) return { ...item, check_reasons: [] }
        return {
          ...item,
          check_reasons: result.reasons,
          confidence: { ...item.confidence, quantity: 0.5, cost: 0.5 },
        }
      }),
    } satisfies RafaInvoiceExtraction,
    checked,
  }
}

export async function processApprovedInvoiceMedia(input: {
  waId: string
  storeId: string
  importId: string
  // Rafa 3.0: entradas de produtos que já são da loja entram direto (com "desfaz"), sem Sim/Não.
  autoApply?: boolean
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
    extraction = await extractInvoicePhotos({ storeId: input.storeId, waId: input.waId, imagePaths })
    const firstCheck = checkInvoice(extraction)
    const strict = !input.autoApply
    if (!extraction.items.length || firstCheck.sumDiffPct > 1 || (strict && (firstCheck.countMismatch || firstCheck.cnpjValid === false))) {
      const reread = await extractInvoicePhotos({
        storeId: input.storeId,
        waId: input.waId,
        imagePaths,
        operation: 'invoice_extraction_recheck',
        recheckMessage: recheckMessage(extraction, firstCheck),
      })
      const secondCheck = checkInvoice(reread)
      if (secondCheck.score > firstCheck.score) extraction = reread
    }
  }
  if (!extraction) {
    await admin.from('rafa_invoice_imports').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', invoice.id)
    await sendText(input.waId, 'Não consegui ler essa nota. Me manda uma foto de frente e com boa luz, o PDF ou o XML da nota.\n— Rafa')
    return { ok: false as const, reason: 'unreadable' }
  }

  extraction = applyInvoiceChecks(extraction).extraction

  const { state } = await loadRafaStore(input.storeId)
  const resolved = await resolveInvoiceExtraction(state, extraction)

  // Linhas sem código de barras válido: tenta achar o produto exato pelo nome da nota.
  const byName = resolved.lines
    .map((line: any, index: number) => ({ line, index }))
    .filter(({ line }) => {
      const ean = String(line.ean || '').replace(/\D/g, '')
      if (isValidGtin(ean)) return false
      const status = line.resolution?.status
      if (status === 'resolved') return false
      if (status === 'ambiguous' && line.resolution.candidates.some((candidate: any) => candidate.id)) return false
      return Boolean(String(line.description || '').trim())
    })
  if (byName.length) {
    const found = await resolveNamesToEan({
      storeId: input.storeId,
      waId: input.waId,
      items: byName.map(({ line, index }) => ({
        index,
        description: String(line.description),
        lineValueCents: Math.round(Number(line.total_cents || 0)),
      })),
    }).catch(() => new Map())
    for (const { line, index } of byName) {
      const hit = found.get(index)
      if (!hit) continue
      if ('missing' in hit) { line.missing = hit.missing; continue }
      const inStore = state.products.find((product) => product.barcode === hit.barcode && !product.deletedAt)
      line.resolution = inStore
        ? { status: 'resolved', candidate: { id: inStore.id, barcode: inStore.barcode, name: inStore.name, source: 'catalog' } }
        : { status: 'new', candidate: { barcode: hit.barcode, name: hit.name, source: 'catalog' } }
    }
  }

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

  await savePendingProducts({
    storeId: input.storeId,
    waId: input.waId,
    invoiceImportId: String(invoice.id),
    supplierCnpj: resolved.supplier_cnpj_valid === false ? null : resolved.supplier_cnpj,
    items: plan.novos,
  })

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

  if (input.autoApply && plan.entradas.length) {
    const committed = await commitRafaChanges({
      storeId: input.storeId,
      waId: input.waId,
      operationId: `invoice:${invoice.id}:entradas`,
      tool: 'nota_entradas',
      summary: `Entrada da nota${resolved.supplier_name ? ` de ${resolved.supplier_name}` : ''}: ${plan.entradas.length} produto(s)`,
      args: { invoice_import_id: invoice.id },
      sideEffects: { invoice_import_id: String(invoice.id) },
      invoiceImportId: String(invoice.id),
      build: () => plan.entradas,
    })
    const applied = committed.status !== 'rejected'
    if (applied) {
      await admin.from('rafa_invoice_imports').update({ status: 'applied', applied_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', invoice.id)
    }
    const body = applied
      ? invoicePlanMessage(plan, resolved.supplier_name, reviewLink, true)
      : `${invoicePlanMessage(plan, resolved.supplier_name, reviewLink, false)}\n(Não consegui dar entrada agora: ${committed.status === 'rejected' ? committed.message : ''})`
    await recordRafaEvent({ waId: input.waId, storeId: input.storeId, direction: 'system', kind: 'invoice', text: `nota ${String(invoice.id).slice(0, 8)}${resolved.supplier_name ? ` de ${resolved.supplier_name}` : ''}: ${plan.entradas.length} entradas ${applied ? 'aplicadas' : 'NÃO aplicadas'}, ${plan.novos.length} novos esperando preço, ${plan.duvidas.length} dúvidas`, data: { import_id: invoice.id } })
    const sent = await sendText(input.waId, `${body}\n— Rafa`)
    if (!sent.ok) throw new Error(sent.error)
    if (applied) await askPendingPrices(input.waId, input.storeId)
    return { ok: true as const, importId: String(invoice.id), itemCount: lines.length, exceptionCount: plan.duvidas.length }
  }

  if (input.autoApply) {
    await recordRafaEvent({ waId: input.waId, storeId: input.storeId, direction: 'system', kind: 'invoice', text: `nota ${String(invoice.id).slice(0, 8)}${resolved.supplier_name ? ` de ${resolved.supplier_name}` : ''}: ${plan.novos.length} novos esperando preço, ${plan.duvidas.length} dúvidas`, data: { import_id: invoice.id } })
  }

  const message = `${invoicePlanMessage(plan, resolved.supplier_name, reviewLink)}\n— Rafa`
  if (plan.entradas.length) {
    // Sim/Não para as entradas; o pedido de preço dos novos vem logo depois do Sim.
    const sent = await askRafaConfirmation({ waId: input.waId, storeId: input.storeId, changes: plan.entradas, state, message, invoiceImportId: String(invoice.id) })
    if (!sent.ok) throw new Error(sent.error)
  } else {
    const sent = await sendText(input.waId, message)
    if (!sent.ok) throw new Error(sent.error)
    await askPendingPrices(input.waId, input.storeId)
  }

  return { ok: true as const, importId: String(invoice.id), itemCount: lines.length, exceptionCount: plan.duvidas.length }
}

// Pede o preço de venda dos produtos novos que ainda não foram perguntados.
// Começa as perguntas de preço dos produtos novos (uma por vez).
export async function askPendingPrices(waId: string, storeId: string) {
  return startPriceQuestions(waId, storeId)
}
