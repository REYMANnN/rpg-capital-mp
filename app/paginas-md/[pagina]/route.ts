import { AI_PAGES, markdownResponse, pageMarkdown } from '@/lib/site/aiContent'

// Versão em texto (markdown) de cada página pública, servida em /<pagina>.md (ver next.config.ts).
export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return AI_PAGES.map((page) => ({ pagina: page.md.slice(1, -3) }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ pagina: string }> }) {
  const { pagina } = await params
  const page = AI_PAGES.find((p) => p.md === `/${pagina}.md`)
  if (!page) return new Response('Not found', { status: 404 })
  return markdownResponse(pageMarkdown(page))
}
