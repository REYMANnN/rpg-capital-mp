import type { MetadataRoute } from 'next'

const SITE_URL = 'https://www.rpgcapital.com.br'

const ALLOW = [
  '/',
  '/sobre',
  '/credito',
  '/integracoes',
  '/cultura',
  '/edu',
  '/interesse',
  '/developers/docs',
  '/openapi.json',
  '/llms.txt',
  '/llms-full.txt',
  '/*.md',
]

// Painel, API e áreas logadas: robôs não entram (é onde ficam os dados das lojas).
const DISALLOW = ['/connect/', '/api/', '/manage/', '/app/', '/u/', '/developers/login']

// Buscadores e assistentes de IA são bem-vindos a ler todo o conteúdo público.
const AI_AND_SEARCH_BOTS = [
  'Googlebot',
  'Google-Extended',
  'Bingbot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'GPTBot',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Applebot',
  'Applebot-Extended',
  'DuckAssistBot',
  'Meta-ExternalAgent',
  'MistralAI-User',
  'CCBot',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_AND_SEARCH_BOTS, allow: ALLOW, disallow: DISALLOW },
      { userAgent: '*', allow: ALLOW, disallow: DISALLOW },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
