import { NextRequest, NextResponse } from 'next/server'
import { createInventoryCloudClient } from '@/lib/supabase/inventoryCloud'

export async function GET(request: NextRequest) {
  const q = String(request.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 3) return NextResponse.json({ items: [] })

  const supabase = createInventoryCloudClient()
  const { data, error } = await supabase.rpc('inventory_v1_search_catalog_candidates', {
    p_query: q,
    p_limit: 24,
  })
  if (error) return NextResponse.json({ items: [], error: 'catalog_search_failed' }, { status: 500 })

  return NextResponse.json({
    items: (data ?? []).map((row: any) => ({
      barcode: String(row.barcode || ''),
      name: String(row.name || ''),
      brand: String(row.brand || ''),
      imageUrl: String(row.image_url || ''),
      source: String(row.source || 'Catálogo'),
      lexicalScore: Number(row.lexical_score || 0),
    })),
  })
}
