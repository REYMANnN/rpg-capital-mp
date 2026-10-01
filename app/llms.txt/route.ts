export const dynamic = 'force-static'

const body = `# RPG Capital

> RPG for Developers permite que sistemas externos acessem dados operacionais de lojas RPG com consentimento explícito do lojista.

## Developer documentation
- https://rpgcapital.com.br/developers/docs — documentação humana completa
- https://rpgcapital.com.br/openapi.json — especificação OpenAPI 3.1
- https://rpgcapital.com.br/llms-full.txt — guia técnico em texto

## Authentication
Developer API keys begin with rpg_dev_live_.
Every request using a Developer key also requires X-RPG-Connection-Id.
A Developer key alone never grants access to a merchant.

## Authorization
The effective permission is the intersection of:
1. scopes configured on the Developer key; and
2. scopes granted by the merchant connection.

## API base
https://rpgcapital.com.br/api/public/v1
`

export async function GET() {
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' } })
}
