import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { syncAllNewsletterSubscribersToSheet } from '@/lib/newsletter/sheets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const given = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * Recuperação Supabase → Google Sheets (aba Destinatários). Idempotente: só adiciona
 * e-mails ausentes e nunca altera Ativo/Descadastrado/Último envio de quem já está lá.
 * GET = Vercel Cron (envia Authorization: Bearer CRON_SECRET). POST = execução manual.
 */
async function handle(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const result = await syncAllNewsletterSubscribersToSheet()
    console.info('newsletter_sheet_full_sync', result)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('newsletter_sheet_full_sync_failed', { message })
    return NextResponse.json({ ok: false, error: message.slice(0, 200) }, { status: 502 })
  }
}

export const GET = handle
export const POST = handle
