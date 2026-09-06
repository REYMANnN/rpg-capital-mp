import { NextResponse } from 'next/server'
import { deleteMalvoItem } from '@/lib/malvo/client'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Not available outside preview.' }, { status: 404 })
  }

  const itemId = new URL(request.url).searchParams.get('itemId')?.trim()
  if (!itemId || !/^[0-9a-f-]{36}$/i.test(itemId)) {
    return NextResponse.json({ error: 'Invalid itemId.' }, { status: 400 })
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
