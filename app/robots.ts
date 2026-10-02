import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/integracoes', '/developers/docs', '/openapi.json', '/llms.txt', '/llms-full.txt'],
      disallow: ['/connect/', '/api/', '/manage/', '/app/', '/developers/login'],
    },
    sitemap: 'https://rpgcapital.com.br/sitemap.xml',
  }
}
