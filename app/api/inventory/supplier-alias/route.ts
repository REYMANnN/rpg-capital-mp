import { NextRequest, NextResponse } from 'next/server'
import { authorizeInventoryRequest, INVENTORY_WRITE_PERMISSION } from '@/lib/accounts/inventoryApiAccess'
import { createInventoryCloudClient } from '@/lib/supabase/inventoryCloud'

const digits = (value: unknown) => String(value ?? '').replace(/\D+/g, '')

export async function GET(request: NextRequest) {
  const supplierDocument = digits(request.nextUrl.searchParams.get('document'))
  const supplierCode = String(request.nextUrl.searchParams.get('code') ?? '').trim().toUpperCase()
  if (![11, 14].includes(supplierDocument.length) || !supplierCode || supplierCode.length > 120) {
    return NextResponse.json({ found: false, error: 'invalid_supplier_key' }, { status: 400 })
  }

  const access = await authorizeInventoryRequest(request, 'products.lookup')
  if (!access.ok) return access.response

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
  const access = await authorizeInventoryRequest(request, INVENTORY_WRITE_PERMISSION)
  if (!access.ok) return access.response

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
    || supplierCode.length > 120
    || !/^\d{8,14}$/.test(barcode)
    || canonicalName.length > 240
    || observedDescription.length > 500
    || purchaseUnit.length > 12
    || !Number.isFinite(packageFactor)
    || packageFactor <= 0
  ) {
    return NextResponse.json({ ok: false, learned: false, error: 'invalid_alias' }, { status: 400 })
  }

  const supabase = createInventoryCloudClient()
  const { data, error } = await supabase.rpc('inventory_v1_confirm_supplier_alias_v10_1', {
    p_installation_id: access.installationId,
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
