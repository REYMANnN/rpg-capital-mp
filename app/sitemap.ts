import type { MetadataRoute } from 'next'

const SITE_URL = 'https://www.rpgcapital.com.br'

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-10-07')
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/integracoes`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/credito`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/edu`, lastModified, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/edu/aulas`, lastModified, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/newsletter`, lastModified, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/sobre`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/cultura`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/developers/docs`, lastModified, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/interesse`, lastModified, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/privacidade`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/termos`, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
