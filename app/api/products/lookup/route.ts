import { NextRequest, NextResponse } from 'next/server'
import { createInventoryCloudClient } from '@/lib/supabase/inventoryCloud'
import { normalizeBarcode } from '@/lib/inventory/catalog/normalize'
import { resolveUniversalProduct } from '@/lib/inventory/catalog/resolver'
import {
  cacheRowToLookupResponse,
  isFreshNegativeCache,
  isUsableCacheHit,
  negativeCacheRow,
  preserveManualCacheIdentity,
  resolutionToCacheRow,
  type CatalogCacheRow,
} from '@/lib/inventory/catalog/cache'

const CACHE_FIELDS = 'barcode,name,brand,image_url,source,raw_metadata,checked_at,manufacturer,category_general,category_raw,confidence_score,cache_status,miss_expires_at,canonical_updated_at'

export async function GET(request: NextRequest) {
  const code = normalizeBarcode(request.nextUrl.searchParams.get('barcode'))
  if (!code) {
    return NextResponse.json({ found: false, error: 'invalid_barcode' }, { status: 400 })
  }

  const supabase = createInventoryCloudClient()
  const { data: cachedData, error: cacheReadError } = await supabase
    .from('inventory_v1_product_catalog_cache')
    .select(CACHE_FIELDS)
    .eq('barcode', code)
    .maybeSingle()
  const cached = !cacheReadError && cachedData ? cachedData as unknown as CatalogCacheRow : null

  if (isUsableCacheHit(cached)) {
    return NextResponse.json(cacheRowToLookupResponse(cached!))
  }

  if (isFreshNegativeCache(cached)) {
    return NextResponse.json({ found: false, barcode: code, cached: true })
  }

  const resolution = await resolveUniversalProduct(code)
  if (resolution.found && resolution.product) {
    const resolvedRow = resolutionToCacheRow(resolution)
    const row = preserveManualCacheIdentity(cached, resolvedRow)
    const { error: cacheWriteError } = await supabase
      .from('inventory_v1_product_catalog_cache')
      .upsert(row)
    if (cacheWriteError) console.warn('inventory universal product cache write failed', cacheWriteError.message)

    const response = cacheRowToLookupResponse(row)
    return NextResponse.json({ ...response, cached: false })
  }

  const missRow = negativeCacheRow(code)
  const { error: missWriteError } = await supabase
    .from('inventory_v1_product_catalog_cache')
    .upsert(missRow)
  if (missWriteError) console.warn('inventory product negative cache write failed', missWriteError.message)

  return NextResponse.json({ found: false, barcode: code, cached: false })
}
