import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { deleteMalvoItem } from '@/lib/malvo/client'

export const dynamic = 'force-dynamic'

const TARGET_SHA256 = '1757ee1c164f18c58781c9035624b41de62cab911386d69b6a299090c198efc7'

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ error: 'Not available.' }, { status: 404 })
  }

  const itemId = new URL(request.url).searchParams.get('itemId')?.trim() ?? ''
  const digest = createHash('sha256').update(itemId).digest('hex')
  if (digest !== TARGET_SHA256) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  try {
    await deleteMalvoItem(itemId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    if (status === 404) return NextResponse.json({ ok: true, alreadyDeleted: true })
    console.error('One-time Malvo revoke failed', error)
    return NextResponse.json({ error: 'Malvo revoke failed.', status: status ?? null }, { status: 502 })
  }
}
