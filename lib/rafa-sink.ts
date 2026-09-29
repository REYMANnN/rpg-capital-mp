import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

// Modo de teste (bateria de cenários): em vez de mandar pelo WhatsApp, as mensagens da Rafa
// são guardadas aqui. Fora de um teste, não existe sink e nada muda.

export type RafaSinkMessage = { to: string; kind: string; body: string; payload: Record<string, unknown>; at: number }

export type RafaSink = {
  messages: RafaSinkMessage[]
  media: Record<string, { bytes: Uint8Array; mime: string; fileName?: string | null }>
  // Bateria de testes sempre roda a Rafa 3.0.
  forceBrain?: boolean
}

const storage = new AsyncLocalStorage<RafaSink>()

export function currentRafaSink() {
  return storage.getStore() || null
}

export function runWithRafaSink<T>(sink: RafaSink, fn: () => Promise<T>) {
  return storage.run(sink, fn)
}
