import { NextRequest, NextResponse } from 'next/server'
import { createInventoryCloudClient } from '@/lib/supabase/inventoryCloud'
import { BatchLimitError, resolveCatalogBatch } from '@/lib/inventory/catalog/batch'
import { resolveUniversalProduct } from '@/lib/inventory/catalog/resolver'
import type { CatalogCacheRow } from '@/lib/inventory/catalog/cache'

const CACHE_COLUMNS = [
  'barcode',
  'name',
  'brand',
  'image_url',
  'source',
  'raw_metadata',
  'system_tag',
  'checked_at',
  'manufacturer',
  'category_general',
  'category_raw',
  'confidence_score',
  'cache_status',
  'miss_expires_at',
  'canonical_updated_at',
].join(',')

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { barcodes?: unknown } | null
  if (!body || !Array.isArray(body.barcodes)) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  }

  const barcodes = body.barcodes
  const supabase = createInventoryCloudClient()

  try {
    const result = await resolveCatalogBatch(barcodes as string[], {
      readCache: async (codes) => {
        if (!codes.length) return []
        const { data, error } = await supabase
          .from('inventory_v1_product_catalog_cache')
          .select(CACHE_COLUMNS)
          .in('barcode', codes)
        if (error) {
          console.warn('inventory batch cache read failed', error.message)
          return []
        }
        return (data ?? []) as unknown as CatalogCacheRow[]
      },
      resolve: (barcode) => resolveUniversalProduct(barcode),
      writeCache: async (rows) => {
        if (!rows.length) return
        const { error } = await supabase
          .from('inventory_v1_product_catalog_cache')
          .upsert(rows)
        if (error) console.warn('inventory batch cache write failed', error.message)
      },
      concurrency: 4,
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    if (error instanceof BatchLimitError) {
      return NextResponse.json({ ok: false, error: 'batch_limit_exceeded', maxUniqueBarcodes: 100 }, { status: 413 })
    }
    console.error('inventory batch lookup failed', error)
    return NextResponse.json({ ok: false, error: 'lookup_failed' }, { status: 500 })
  }
}
