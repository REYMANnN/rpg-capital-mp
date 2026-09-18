import { createBalcaoDeepLink } from '@/lib/deeplink'
import { extractRafaInvoiceImages, type RafaMediaClass } from '@/lib/rafa-ai'
import { loadRafaStore } from '@/lib/inventory/rafa-store'
import { loadInvoiceProofDataUri } from '@/lib/rafa-media'
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
    const paths = Array.isArray(recent.media_paths) ? recent.media_paths.filter((value): value is string => typeof value === 'string') : []
    const nextPaths = [...new Set([...paths, input.mediaPath])]
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

  const paths = Array.isArray(invoice.media_paths) ? invoice.media_paths.filter((value): value is string => typeof value === 'string') : []
  const imagePaths = paths.filter((path) => /\.(?:jpe?g|png|webp)$/i.test(path))
  if (!imagePaths.length) {
    await admin.from('rafa_invoice_imports').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', invoice.id)
    await sendText(input.waId, 'Reconheci o arquivo, mas nesta fase a extração da nota funciona por foto. Me mande uma foto legível da nota.\n— Rafa')
    return { ok: false as const, reason: 'photo_required' }
  }

  await admin.from('rafa_invoice_imports').update({ status: 'extracting', updated_at: new Date().toISOString() }).eq('id', invoice.id)

  const dataUris = []
  for (const path of imagePaths.slice(0, 5)) dataUris.push(await loadInvoiceProofDataUri(path))
  const extraction = await extractRafaInvoiceImages({
    storeId: input.storeId,
    waId: input.waId,
    dataUris,
  })
  const { state } = await loadRafaStore(input.storeId)
  const resolved = await resolveInvoiceExtraction(state, extraction)

  const lines = resolved.lines
  const exceptionCount = lines.filter((line: any) => {
    const confidence = line.confidence || {}
    return line.resolution?.status !== 'resolved'
      || Number(confidence.product || 0) < 0.85
      || Number(confidence.quantity || 0) < 0.85
      || Number(confidence.cost || 0) < 0.85
  }).length
  const itemCount = lines.length
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
    status: exceptionCount ? 'pending_review' : 'ready',
    item_count: itemCount,
    unit_count: unitCount,
    total_cost_cents: totalCostCents,
    updated_at: now,
  }).eq('id', invoice.id)
  if (updateError) throw updateError

  const { error: sessionError } = await admin.from('whatsapp_sessions').update({
    fluxo_atual: 'prateleira',
    etapa: 'conferencia_nota',
    payload: { invoice_import_id: invoice.id },
    updated_at: now,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }).eq('wa_id', input.waId)
  if (sessionError) throw sessionError

  const link = await createBalcaoDeepLink({ waId: input.waId, storeId: input.storeId, fluxo: 'prateleira' })
  const supplier = resolved.supplier_name || 'fornecedor'
  await sendText(
    input.waId,
    `Nota de ${supplier}: ${itemCount} itens · ${itemCount - exceptionCount} identificados · ${exceptionCount} precisam de você. Abra para conferir:\n${link.url}\n— Rafa`,
  )

  return { ok: true as const, importId: String(invoice.id), itemCount, exceptionCount }
}
