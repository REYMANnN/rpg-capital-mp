import { after, NextResponse, type NextRequest } from 'next/server'

import { recordWebhookFailureReason, settleCharge } from '@/lib/sumup/charges'
import { verifySignature } from '@/lib/sumup/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Resultado da cobrança na Solo (return_url do checkout). A URL é assinada por cobrança e,
// mesmo assim, o status é conferido direto na SumUp antes de registrar a venda.
export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const chargeId = url.searchParams.get('c') || ''
  if (!UUID.test(chargeId) || !verifySignature(`solo:${chargeId}`, url.searchParams.get('s') || '')) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const body = await request.json().catch(() => null) as { payload?: { failure_reason?: string } } | null

  after(async () => {
    try {
      await recordWebhookFailureReason(chargeId, body?.payload?.failure_reason || null)
      // A transação pode levar alguns segundos para aparecer como final na API.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const result = await settleCharge(chargeId)
        if (result.status !== 'pending' && result.status !== 'unknown') return
        await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)))
      }
    } catch (error) {
      console.error('sumup solo webhook failed', error instanceof Error ? error.message : error)
    }
  })
  return NextResponse.json({ ok: true })
}
