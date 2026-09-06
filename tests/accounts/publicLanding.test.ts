import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const landingDir = path.join(root, 'cloudflare-landing')

function read(relative: string) {
  return fs.readFileSync(path.join(landingDir, relative), 'utf8')
}

test('landing apresenta a marca, o preco e o valor principal do produto', () => {
  const html = read('index.html')

  assert.match(html, /RPG para Balcões/)
  assert.match(html, /Tudo que sua loja precisa para vender, controlar e crescer/)
  assert.match(html, /R\$\s*5,99/)
  assert.match(html, /menos de um cafezinho/i)
  assert.match(html, /Inventário/i)
  assert.match(html, /Vendas/i)
  assert.match(html, /Finanças/i)
  assert.match(html, /Equipe/i)
  assert.match(html, /sem taxa no Pix/i)
  assert.match(html, /comercial@rpgcapital\.com\.br/)
})

test('landing envia login e cadastro para o web app que continua no Vercel', () => {
  const html = read('index.html')

  assert.match(html, /https:\/\/www\.rpgcapital\.com\.br\/login\?intent=login/)
  assert.match(html, /https:\/\/www\.rpgcapital\.com\.br\/auth\/signup\/reset/)
})

test('landing possui arquivos de descoberta para buscadores e IAs', () => {
  const html = read('index.html')
  const robots = read('robots.txt')
  const sitemap = read('sitemap.xml')
  const llms = read('llms.txt')

  assert.match(html, /application\/ld\+json/)
  assert.match(html, /og:title/)
  assert.match(html, /rel="canonical"/)
  assert.match(robots, /User-agent: \*/)
  assert.match(robots, /OAI-SearchBot/)
  assert.match(robots, /Sitemap: https:\/\/rpgcapital\.com\.br\/sitemap\.xml/)
  assert.match(sitemap, /https:\/\/rpgcapital\.com\.br\//)
  assert.match(llms, /RPG para Balcões/)
  assert.match(llms, /R\$ 5,99/)
})
