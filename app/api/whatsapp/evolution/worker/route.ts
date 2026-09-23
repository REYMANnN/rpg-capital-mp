import { runOutboxWorker } from '@/lib/whatsapp-evolution'
import { secretMatches } from '@/lib/whatsapp-evolution-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Chamado a cada minuto pelo cron da VM (curl). Faz retry, fallback para texto e drena a fila.
export async function POST(req: Request) {
  if (!secretMatches(req.headers.get('x-rafa-worker-secret'), 'WA_WORKER_SECRET')) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const report = await runOutboxWorker()
    return Response.json({ ok: true, report })
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'worker_failed' }, { status: 500 })
  }
}
