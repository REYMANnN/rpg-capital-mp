import { NextRequest, NextResponse } from 'next/server'

type ExternalProduct = {
  code?: string
  product_name?: string
  product_name_pt?: string
  brands?: string
  image_front_url?: string
}

type ExternalResponse = {
  status?: number
  product?: ExternalProduct
}

const SOURCES = [
  { name: 'Open Food Facts', base: 'https://world.openfoodfacts.org' },
  { name: 'Open Products Facts', base: 'https://world.openproductsfacts.org' },
]

async function lookupSource(base: string, code: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3500)
  try {
    const fields = 'code,product_name,product_name_pt,brands,image_front_url'
    const response = await fetch(`${base}/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`, {
      headers: {
        'User-Agent': 'RPG-Mercadinho/1.0 (https://rpg-capital-mp-25zw.vercel.app)',
      },
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok) return null
    const payload = await response.json() as ExternalResponse
    if (payload.status !== 1 || !payload.product) return null
    return payload.product
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('barcode')?.replace(/\s+/g, '').trim() ?? ''
  if (!/^\d{8,14}$/.test(code)) {
    return NextResponse.json({ found: false, error: 'invalid_barcode' }, { status: 400 })
  }

  for (const source of SOURCES) {
    const product = await lookupSource(source.base, code)
    if (!product) continue

    const name = (product.product_name_pt || product.product_name || '').trim()
    if (!name) continue

    return NextResponse.json({
      found: true,
      source: source.name,
      product: {
        barcode: code,
        name,
        brand: product.brands?.trim() || '',
        imageUrl: product.image_front_url || '',
      },
    })
  }

  return NextResponse.json({ found: false, barcode: code })
}
