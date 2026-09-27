import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  businessName: z.string().trim().min(2).max(160),
  address: z.string().trim().min(5).max(240),
  phone: z.string().trim().min(8).max(32),
  email: z.string().trim().email().max(180),
  secondaryPhone: z.union([z.string().trim().min(8).max(32), z.literal('')]).optional().transform((value) => value || null),
  secondaryEmail: z.union([z.string().trim().email().max(180), z.literal('')]).optional().transform((value) => value || null),
  referralSource: z.string().trim().min(2).max(240),
  helpText: z.string().trim().min(5).max(2000),
})

export async function POST(request: NextRequest) {
  const raw = await request.json().catch(() => null)
  const parsed = schema.safeParse(raw)

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Confira os campos obrigatórios e tente novamente.' },
      { status: 400 },
    )
  }

  const { error } = await createAdminClient().from('rpg_interest_leads').insert({
    name: parsed.data.name,
    business_name: parsed.data.businessName,
    address: parsed.data.address,
    phone: parsed.data.phone,
    email: parsed.data.email.toLowerCase(),
    secondary_phone: parsed.data.secondaryPhone,
    secondary_email: parsed.data.secondaryEmail?.toLowerCase() ?? null,
    referral_source: parsed.data.referralSource,
    help_text: parsed.data.helpText,
    source: 'public_interest_page',
  })

  if (error) {
    console.error('interest_form_insert_failed', { code: error.code })
    return NextResponse.json(
      { ok: false, error: 'Não foi possível enviar agora. Tente novamente.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
