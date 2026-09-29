import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params
  return NextResponse.redirect(new URL(`/convite/${encodeURIComponent(code)}`, request.url))
}
