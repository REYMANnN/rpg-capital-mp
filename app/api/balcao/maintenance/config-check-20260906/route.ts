import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (process.env.VERCEL_ENV !== 'production') return NextResponse.json({ error: 'Not available.' }, { status: 404 })
  return NextResponse.json({
    asaasApiKey: Boolean(process.env.ASAAS_API_KEY?.trim()),
    asaasApiKeyBalcao: Boolean(process.env.ASAAS_API_KEY_balcao?.trim()),
    malvoClientId: Boolean(process.env.MALVO_CLIENT_ID?.trim()),
    malvoClientSecret: Boolean(process.env.MALVO_CLIENT_SECRET?.trim()),
    supabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  })
}
