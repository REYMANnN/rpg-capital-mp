import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_VERSION = 'v8'
const COOKIE_NAME = 'inventory_installation_id'

type StoreData = {
  products: unknown[]
  sales: unknown[]
  movements: unknown[]
  scaleRule?: unknown
}

function getInstallationId(request: NextRequest) {
  const existing = request.cookies.get(COOKIE_NAME)?.value
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return { id: existing, fresh: false }
  return { id: randomUUID(), fresh: true }
}

function withInstallationCookie(response: NextResponse, id: string, fresh: boolean) {
  if (fresh) {
    response.cookies.set(COOKIE_NAME, id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 365 * 2,
    })
  }
  return response
}

function isState(value: unknown): value is StoreData {
  if (!value || typeof value !== 'object') return false
  const state = value as StoreData
  return Array.isArray(state.products) && Array.isArray(state.sales) && Array.isArray(state.movements)
}

export async function GET(request: NextRequest) {
  const installation = getInstallationId(request)
  const supabase = createAdminClient()

  const { data: store, error: storeError } = await supabase
    .from('inventory_v1_stores')
    .select('id')
    .eq('installation_id', installation.id)
    .maybeSingle()

  if (storeError) {
    return withInstallationCookie(NextResponse.json({ ok: false, error: 'store_lookup_failed' }, { status: 500 }), installation.id, installation.fresh)
  }

  if (!store) {
    return withInstallationCookie(NextResponse.json({ ok: true, found: false, version: APP_VERSION }), installation.id, installation.fresh)
  }

  const [{ data: products, error: productsError }, { data: sales, error: salesError }, { data: movements, error: movementsError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from('inventory_v1_products').select('*').eq('store_id', store.id).order('created_at'),
    supabase.from('inventory_v1_sales').select('*').eq('store_id', store.id).order('sold_at', { ascending: false }),
    supabase.from('inventory_v1_movements').select('*').eq('store_id', store.id).order('moved_at'),
    supabase.from('inventory_v1_settings').select('*').eq('store_id', store.id).maybeSingle(),
  ])

  if (productsError || salesError || movementsError || settingsError) {
    return withInstallationCookie(NextResponse.json({ ok: false, error: 'state_lookup_failed' }, { status: 500 }), installation.id, installation.fresh)
  }

  const saleIds = (sales ?? []).map((sale) => sale.id)
  let items: any[] = []
  if (saleIds.length) {
    const { data, error } = await supabase.from('inventory_v1_sale_items').select('*').in('sale_id', saleIds)
    if (error) {
      return withInstallationCookie(NextResponse.json({ ok: false, error: 'sale_items_lookup_failed' }, { status: 500 }), installation.id, installation.fresh)
    }
    items = data ?? []
  }

  const state = {
    products: (products ?? []).map((product) => ({
      id: product.id,
      barcode: product.barcode,
      name: product.name,
      unit: product.unit,
      priceCents: Number(product.price_cents),
      averageCostCents: Number(product.average_cost_cents),
      stockMilli: Number(product.stock_milli),
      minStockMilli: Number(product.min_stock_milli),
      ...(product.catalog_source ? { catalogSource: product.catalog_source } : {}),
      ...(product.catalog_brand ? { catalogBrand: product.catalog_brand } : {}),
      ...(product.catalog_image_url ? { catalogImageUrl: product.catalog_image_url } : {}),
    })),
    sales: (sales ?? []).map((sale) => ({
      id: sale.id,
      createdAt: sale.sold_at,
      totalCents: Number(sale.total_cents),
      items: items.filter((item) => item.sale_id === sale.id).map((item) => ({
        productId: item.product_id,
        quantityMilli: Number(item.quantity_milli),
        unitPriceCents: Number(item.unit_price_cents),
        lineTotalCents: Number(item.line_total_cents),
      })),
    })),
    movements: (movements ?? []).map((movement) => ({
      id: movement.id,
      productId: movement.product_id,
      type: movement.movement_type,
      quantityMilli: Number(movement.quantity_milli),
      createdAt: movement.moved_at,
      note: movement.note,
    })),
    scaleRule: settings?.scale_rule ?? {},
  }

  return withInstallationCookie(NextResponse.json({ ok: true, found: true, version: settings?.app_version ?? APP_VERSION, state }), installation.id, installation.fresh)
}

export async function PUT(request: NextRequest) {
  const installation = getInstallationId(request)
  let state: unknown
  try {
    state = await request.json()
  } catch {
    return withInstallationCookie(NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }), installation.id, installation.fresh)
  }

  if (!isState(state)) {
    return withInstallationCookie(NextResponse.json({ ok: false, error: 'invalid_state' }, { status: 400 }), installation.id, installation.fresh)
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('inventory_v1_sync_state', {
    p_installation_id: installation.id,
    p_state: state,
    p_app_version: APP_VERSION,
  })

  if (error) {
    console.error('inventory_v1_sync_state failed', error)
    return withInstallationCookie(NextResponse.json({ ok: false, error: 'sync_failed' }, { status: 500 }), installation.id, installation.fresh)
  }

  return withInstallationCookie(NextResponse.json({ ok: true, storeId: data, version: APP_VERSION }), installation.id, installation.fresh)
}
