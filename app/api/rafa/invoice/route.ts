import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

import { BALCAO_SESSION_COOKIE, verifyBalcaoSessionToken } from '@/lib/deeplink'
import { calculatePurchaseUpdate } from '@/lib/inventory/intake'
import { validateNewProductCommercialData } from '@/lib/inventory/productRules'
import { loadRafaStore, persistRafaState, type RafaMovement, type RafaStoreState } from '@/lib/inventory/rafa-store'
import { rememberSupplierProduct } from '@/lib/rafa-products'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMenu } from '@/lib/whatsapp-menu'
import { sendText } from '@/lib/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function context(request: NextRequest) {
  const token = request.cookies.get(BALCAO_SESSION_COOKIE)?.value
  if (!token) return null
  try {
    const claims = await verifyBalcaoSessionToken(token)
    if (!claims.store_id || claims.fluxo !== 'prateleira') return null
    const admin = createAdminClient()
    const { data: session } = await admin.from('whatsapp_sessions')
      .select('wa_id,store_id,payload,expires_at')
      .eq('wa_id', claims.wa_id)
      .eq('store_id', claims.store_id)
      .maybeSingle()
    if (!session || new Date(session.expires_at).getTime() <= Date.now()) return null
    return { claims, session, admin }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const ctx = await context(request)
  if (!ctx) return NextResponse.json({ ok: false, error: 'not_authorized' }, { status: 401 })
  const requested = request.nextUrl.searchParams.get('id')
  const sessionImport = typeof ctx.session.payload?.invoice_import_id === 'string' ? ctx.session.payload.invoice_import_id : null
  const importId = requested || sessionImport
  if (!importId || importId !== sessionImport) return NextResponse.json({ ok: false, error: 'invalid_import' }, { status: 403 })

  const { data, error } = await ctx.admin.from('rafa_invoice_imports')
    .select('id,supplier_cnpj,supplier_name,classification,extraction,status,item_count,unit_count,total_cost_cents,created_at')
    .eq('id', importId)
    .eq('wa_id', ctx.claims.wa_id)
    .eq('store_id', ctx.claims.store_id)
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: 'lookup_failed' }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true, invoice: data })
}

type Decision = {
  index: number
  productId?: string
  barcode?: string
  name?: string
  salePriceCents?: number
  quantity?: number
  unitCostCents?: number
}

export async function POST(request: NextRequest) {
  const ctx = await context(request)
  if (!ctx) return NextResponse.json({ ok: false, error: 'not_authorized' }, { status: 401 })

  let body: { importId?: string; decisions?: Decision[] }
  try { body = await request.json() } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  const sessionImport = typeof ctx.session.payload?.invoice_import_id === 'string' ? ctx.session.payload.invoice_import_id : null
  if (!body.importId || body.importId !== sessionImport) return NextResponse.json({ ok: false, error: 'invalid_import' }, { status: 403 })

  const { data: invoice, error: invoiceError } = await ctx.admin.from('rafa_invoice_imports')
    .select('*')
    .eq('id', body.importId)
    .eq('wa_id', ctx.claims.wa_id)
    .eq('store_id', ctx.claims.store_id)
    .maybeSingle()
  if (invoiceError || !invoice) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (invoice.status === 'applied') return NextResponse.json({ ok: false, error: 'already_applied' }, { status: 409 })

  const extracted = invoice.extraction as any
  const lines = Array.isArray(extracted?.lines) ? extracted.lines : []
  if (!lines.length) return NextResponse.json({ ok: false, error: 'no_items' }, { status: 400 })
  const decisions = new Map((body.decisions || []).map((decision) => [Number(decision.index), decision]))

  const { state: before } = await loadRafaStore(String(ctx.claims.store_id))
  const after: RafaStoreState = {
    ...before,
    products: before.products.map((product) => ({ ...product })),
    sales: [...before.sales],
    movements: [...before.movements],
  }
  const audit: Array<Record<string, unknown>> = []
  const supplierCnpj = String(invoice.supplier_cnpj || extracted?.supplier_cnpj || '').replace(/\D/g, '')
  let unitCount = 0
  let totalCostCents = 0
  const movementIds: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const decision = decisions.get(index)
    const quantity = Number(decision?.quantity ?? line.quantity)
    const unitCostCents = Number(decision?.unitCostCents ?? line.unit_cost_cents)
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(unitCostCents) || unitCostCents < 0) {
      return NextResponse.json({ ok: false, error: 'unresolved_fields', index }, { status: 400 })
    }
    const quantityMilli = Math.round(quantity * 1000)
    const resolution = line.resolution || {}
    const productId = decision?.productId || (resolution.status === 'resolved' ? resolution.candidate?.id : undefined)
    let product = productId ? after.products.find((item) => item.id === productId && !item.deletedAt) : undefined
    let createdThisLine = false

    if (!product) {
      const chosen = decision?.barcode
        ? { barcode: decision.barcode, name: decision.name }
        : resolution.status === 'new'
          ? resolution.candidate
          : undefined
      const barcode = String(chosen?.barcode || line.ean || '').replace(/\s/g, '')
      const name = String(chosen?.name || line.description || '').trim()
      const salePriceCents = Number(decision?.salePriceCents)
      if (!barcode || !name || !Number.isInteger(salePriceCents)) {
        return NextResponse.json({ ok: false, error: 'product_needs_review', index }, { status: 400 })
      }
      const commercialError = validateNewProductCommercialData(salePriceCents, unitCostCents)
      if (commercialError) return NextResponse.json({ ok: false, error: commercialError, index }, { status: 400 })
      if (after.products.some((item) => item.barcode === barcode && !item.deletedAt)) {
        product = after.products.find((item) => item.barcode === barcode && !item.deletedAt)
      } else {
        const update = calculatePurchaseUpdate(0, 0, quantityMilli, unitCostCents)
        product = {
          id: randomUUID(),
          barcode,
          name,
          unit: 'UN',
          priceCents: salePriceCents,
          averageCostCents: update.averageCostCents,
          stockMilli: update.stockMilli,
          minStockMilli: 0,
          catalogSource: 'rafa_invoice_photo',
        }
        after.products.push(product)
        createdThisLine = true
        const movementId = randomUUID()
        movementIds.push(movementId)
        after.movements.push({
          id: movementId,
          productId: product.id,
          type: 'purchase',
          quantityMilli,
          createdAt: new Date().toISOString(),
          note: 'Entrada por foto de nota com a Rafa',
          supplierDocument: supplierCnpj || undefined,
          supplierName: String(invoice.supplier_name || extracted?.supplier_name || ''),
          origem: 'invoice_photo',
          rafaInvoiceImportId: String(invoice.id),
        } satisfies RafaMovement)
        audit.push({ tipo: 'entrada_novo_produto', productId: product.id, produto: product.name, de: 0, para: product.stockMilli, quantidade: quantityMilli, custoUnitario: unitCostCents })
      }
    }

    if (product && !createdThisLine) {
      const beforeStock = product.stockMilli
      const update = calculatePurchaseUpdate(product.stockMilli, Math.max(0, Math.round(product.averageCostCents || 0)), quantityMilli, unitCostCents)
      product.stockMilli = update.stockMilli
      product.averageCostCents = update.averageCostCents
      const movementId = randomUUID()
      movementIds.push(movementId)
      after.movements.push({
        id: movementId,
        productId: product.id,
        type: 'purchase',
        quantityMilli,
        createdAt: new Date().toISOString(),
        note: 'Entrada por foto de nota com a Rafa',
        supplierDocument: supplierCnpj || undefined,
        supplierName: String(invoice.supplier_name || extracted?.supplier_name || ''),
        origem: 'invoice_photo',
        rafaInvoiceImportId: String(invoice.id),
      } satisfies RafaMovement)
      audit.push({ tipo: 'entrada', productId: product.id, produto: product.name, de: beforeStock, para: product.stockMilli, quantidade: quantityMilli, custoUnitario: unitCostCents })
    }

    if (product && supplierCnpj && line.supplier_code) {
      await rememberSupplierProduct({
        supplierCnpj,
        supplierCode: String(line.supplier_code),
        description: String(line.description || product.name),
        barcode: product.barcode,
      })
    }
    unitCount += quantity
    totalCostCents += Math.round(quantity * unitCostCents)
  }

  await persistRafaState({
    storeId: String(ctx.claims.store_id),
    waId: ctx.claims.wa_id,
    before,
    after,
    audit,
  })

  const now = new Date().toISOString()
  const { error: updateError } = await ctx.admin.from('rafa_invoice_imports').update({
    status: 'applied',
    item_count: lines.length,
    unit_count: unitCount,
    total_cost_cents: totalCostCents,
    movement_ids: movementIds,
    applied_at: now,
    updated_at: now,
  }).eq('id', invoice.id)
  if (updateError) return NextResponse.json({ ok: false, error: 'import_update_failed' }, { status: 500 })

  await ctx.admin.from('whatsapp_sessions').update({
    fluxo_atual: null,
    etapa: 'menu',
    payload: {},
    updated_at: now,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }).eq('wa_id', ctx.claims.wa_id)

  await sendText(ctx.claims.wa_id, `Pronto. Adicionei ${lines.length} produtos e ${unitCount.toLocaleString('pt-BR')} unidades à sua prateleira.\n— Rafa`)
  await sendMenu(ctx.claims.wa_id)

  return NextResponse.json({ ok: true, items: lines.length, units: unitCount, totalCostCents })
}
