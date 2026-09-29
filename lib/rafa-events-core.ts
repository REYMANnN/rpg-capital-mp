// Formata os eventos da conversa como texto para a IA (puro, testável).

export type RafaEventRow = {
  id: string
  direction: 'in' | 'out' | 'system'
  kind: string
  text: string | null
  data: Record<string, unknown> | null
  media_path: string | null
  source_id?: string | null
  created_at: string
}

const clock = (iso: string) => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
}).format(new Date(iso))

function clip(value: string, max: number) {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function describeRafaEvent(event: RafaEventRow): string {
  const text = clip(String(event.text || ''), 700)
  const shortId = event.id.slice(0, 8)
  switch (event.kind) {
    case 'text': return event.direction === 'in' ? `Lojista: ${text}` : `Rafa: ${text}`
    case 'audio': return `Lojista (áudio): ${text || '[não deu para transcrever]'}`
    case 'image': return `Lojista mandou FOTO [foto ${shortId}]${text ? `: ${text}` : ''}`
    case 'document': return `Lojista mandou ARQUIVO [arquivo ${shortId}]${text ? `: ${text}` : ''}`
    case 'buttons': return `Rafa (pergunta): ${text}`
    case 'menu': return 'Rafa mandou o menu.'
    case 'action': return `✔ Rafa fez: ${text}`
    case 'undo': return `↩ Rafa desfez: ${text}`
    case 'invoice': return `🧾 Nota: ${text}`
    case 'memory': return `🧠 ${text}`
    case 'button': return `Lojista tocou: ${text}`
    default: return `${event.direction === 'in' ? 'Lojista' : 'Rafa'} (${event.kind}): ${text}`
  }
}

// Mais antigo → mais novo. Corta pelo começo se passar do tamanho (o recente sempre fica).
export function formatRafaHistory(events: RafaEventRow[], maxChars = 14_000) {
  if (!events.length) return 'CONVERSA RECENTE: nenhuma mensagem nas últimas 48 h.'
  const lines = events.map((event) => `${clock(event.created_at)} ${describeRafaEvent(event)}`)
  const kept: string[] = []
  let size = 0
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    size += lines[index].length + 1
    if (size > maxChars) break
    kept.unshift(lines[index])
  }
  const cut = lines.length - kept.length
  return [
    `CONVERSA RECENTE (últimas 48 h, horário de Brasília, mais antiga → mais nova)${cut ? `; ${cut} mensagens mais antigas omitidas` : ''}:`,
    ...kept,
  ].join('\n')
}
