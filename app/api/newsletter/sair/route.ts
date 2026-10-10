import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit } from '@/lib/rate-limit'
import { unsubscribeFromSheet } from '@/lib/newsletter/sheet-webhook'
import { UNSUBSCRIBE_REASONS } from '@/lib/newsletter/reasons'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  email: z.string().trim().email().max(180),
  reason: z.union([z.enum(UNSUBSCRIBE_REASONS), z.literal('')]).optional().transform((value) => value || null),
})

/** Descadastro da newsletter Radar do Lojista. Não revela se o e-mail estava na lista. */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  if (!checkRateLimit(`newsletter-sair:${ip}`, 5, 60_000)) {
    return NextResponse.json({ ok: false, error: 'Muitas tentativas. Tente de novo em um minuto.' }, { status: 429 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Confira o e-mail e tente de novo.' }, { status: 400 })
  }

  const ok = await unsubscribeFromSheet(parsed.data.email.toLowerCase(), parsed.data.reason)
  if (!ok) {
    return NextResponse.json({ ok: false, error: 'Não conseguimos tirar seu e-mail agora. Tente de novo em instantes.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
