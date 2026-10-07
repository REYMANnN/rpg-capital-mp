import type { MetadataRoute } from 'next'

const SITE_URL = 'https://www.rpgcapital.com.br'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/integracoes', '/credito', '/cultura', '/sobre', '/edu', '/interesse', '/developers/docs', '/openapi.json', '/llms.txt', '/llms-full.txt'],
      disallow: ['/connect/', '/api/', '/manage/', '/app/', '/developers/login'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
