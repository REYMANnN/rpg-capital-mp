import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://rpgcapital.com.br/', changeFrequency: 'weekly', priority: 1 },
    { url: 'https://rpgcapital.com.br/integracoes', changeFrequency: 'weekly', priority: 0.9 },
    { url: 'https://rpgcapital.com.br/developers/docs', changeFrequency: 'weekly', priority: 0.9 },
  ]
}
