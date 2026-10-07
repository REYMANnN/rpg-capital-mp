import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  email: z.string().trim().email().max(180),
  name: z.union([z.string().trim().max(120), z.literal('')]).optional().transform((value) => value || null),
  source: z.enum(['site_edu', 'site_edu_aulas']).optional().default('site_edu'),
})

/** Inscrição na newsletter do RPG Edu. Só guarda o e-mail (e o nome, se vier). */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  if (!checkRateLimit(`newsletter:${ip}`, 5, 60_000)) {
    return NextResponse.json({ ok: false, error: 'Muitas tentativas. Tente de novo em um minuto.' }, { status: 429 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Confira o e-mail e tente de novo.' }, { status: 400 })
  }

  const { error } = await createAdminClient()
    .from('rpg_newsletter_subscribers')
    .upsert(
      { email: parsed.data.email.toLowerCase(), name: parsed.data.name, source: parsed.data.source },
      { onConflict: 'email', ignoreDuplicates: true },
    )

  if (error) {
    console.error('newsletter_insert_failed', { code: error.code })
    return NextResponse.json({ ok: false, error: 'Não foi possível inscrever agora. Tente de novo.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
