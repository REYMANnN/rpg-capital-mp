import { NextRequest, NextResponse } from 'next/server'
import { createInventoryCloudClient } from '@/lib/supabase/inventoryCloud'

const COOKIE_NAME = 'inventory_installation_id'
const digits = (value: unknown) => String(value ?? '').replace(/\D+/g, '')

export async function GET(request: NextRequest) {
  const supplierDocument = digits(request.nextUrl.searchParams.get('document'))
  const supplierCode = String(request.nextUrl.searchParams.get('code') ?? '').trim().toUpperCase()
  if (![11, 14].includes(supplierDocument.length) || !supplierCode) {
    return NextResponse.json({ found: false, error: 'invalid_supplier_key' }, { status: 400 })
  }

  const supabase = createInventoryCloudClient()
  const { data, error } = await supabase
    .from('inventory_v1_supplier_product_aliases')
    .select('supplier_document,supplier_code,barcode,canonical_name,observed_description,purchase_unit,package_factor,confirmations,revisions,last_seen_at')
    .eq('supplier_document', supplierDocument)
    .eq('supplier_code', supplierCode)
    .maybeSingle()

  if (error) return NextResponse.json({ found: false, error: 'alias_lookup_failed' }, { status: 500 })
  if (!data) return NextResponse.json({ found: false })

  return NextResponse.json({
    found: true,
    alias: {
      supplierDocument: data.supplier_document,
      supplierCode: data.supplier_code,
      barcode: data.barcode,
      canonicalName: data.canonical_name,
      observedDescription: data.observed_description,
      purchaseUnit: data.purchase_unit || 'UN',
      packageFactor: Number(data.package_factor || 0),
      confirmations: data.confirmations,
      revisions: data.revisions,
      lastSeenAt: data.last_seen_at,
    },
  })
}

export async function POST(request: NextRequest) {
  const installationId = request.cookies.get(COOKIE_NAME)?.value ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(installationId)) {
    return NextResponse.json({ ok: false, learned: false, error: 'inventory_installation_required' }, { status: 401 })
  }

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ ok: false, learned: false, error: 'invalid_json' }, { status: 400 })
  }

  const supplierDocument = digits(body?.supplierDocument)
  const supplierCode = String(body?.supplierCode ?? '').trim().toUpperCase()
  const barcode = digits(body?.barcode)
  const canonicalName = String(body?.canonicalName ?? '').trim()
  const observedDescription = String(body?.observedDescription ?? '').trim()
  const purchaseUnit = String(body?.purchaseUnit ?? 'UN').trim().toUpperCase() || 'UN'
  const packageFactor = Number(body?.packageFactor ?? (purchaseUnit === 'UN' || purchaseUnit === 'KG' ? 1 : 0))

  if (
    ![11, 14].includes(supplierDocument.length)
    || !supplierCode
    || !/^\d{8,14}$/.test(barcode)
    || !Number.isFinite(packageFactor)
    || packageFactor <= 0
  ) {
    return NextResponse.json({ ok: false, learned: false, error: 'invalid_alias' }, { status: 400 })
  }

  const supabase = createInventoryCloudClient()
  const { data, error } = await supabase.rpc('inventory_v1_confirm_supplier_alias_v10_1', {
    p_installation_id: installationId,
    p_supplier_document: supplierDocument,
    p_supplier_code: supplierCode,
    p_barcode: barcode,
    p_canonical_name: canonicalName,
    p_observed_description: observedDescription,
    p_purchase_unit: purchaseUnit,
    p_package_factor: packageFactor,
  })

  if (error) {
    console.error('inventory_v1_confirm_supplier_alias_v10_1 failed', error)
    return NextResponse.json({ ok: false, learned: false, error: 'alias_write_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, learned: true, alias: data })
}
