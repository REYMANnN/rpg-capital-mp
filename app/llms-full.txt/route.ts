export const dynamic = 'force-static'

const body = `# RPG for Developers — Integration Guide

Base URL: https://rpgcapital.com.br/api/public/v1

## Account model
A Developer account is logically separate from a merchant RPG account even if both use the same Google identity. Developer applications, secrets and merchant grants are stored independently.

## Credentials
Create an application at https://rpgcapital.com.br/developers
Generate a Secret API Key. It is displayed once and has the format:
rpg_dev_live_<prefix>_<secret>

Do not expose the secret in a browser, URL, mobile app bundle or merchant-facing page.

## RPG Connect
Generate a connection link from the Developer dashboard and select requested scopes.
Send that link to the merchant.
The merchant signs into RPG, chooses a store and can remove scopes before authorizing.
Only an owner or admin can authorize.
A successful authorization creates a Connection ID.

## Request authentication
Authorization: Bearer <RPG_API_KEY>
X-RPG-Connection-Id: <RPG_CONNECTION_ID>

The key must belong to the same Developer app as the connection.
The requested endpoint scope must be present on both the key and the merchant grant.

## Scopes
products:read — read products
products:write — create/update products
inventory:read — read inventory
inventory:write — write inventory movements
sales:read — read sales
sales:ingest — ingest external sales
finance:read — read financial data
pricing:read — read pricing data
pricing:write — apply pricing changes
webhooks:manage — manage webhooks

## Read endpoints
GET /products — products:read
GET /products/{id} — products:read
GET /inventory — inventory:read
GET /inventory/movements — inventory:read
GET /sales — sales:read
GET /sales/{id} — sales:read
GET /finance/transactions — finance:read
GET /finance/summary — finance:read
GET /pricing/history — pricing:read

## Write endpoints
POST /imports/products — products:write
POST /imports/inventory-movements — inventory:write
POST /imports/sales — sales:ingest
POST /pricing/recommendations/{id}/apply — pricing:write

Write endpoints require Idempotency-Key. Use a unique stable identifier for one logical operation.

## Example
curl https://rpgcapital.com.br/api/public/v1/products \
  -H "Authorization: Bearer $RPG_API_KEY" \
  -H "X-RPG-Connection-Id: $RPG_CONNECTION_ID"

## Errors
401 invalid_api_key — invalid/revoked credential
400 connection_required — missing X-RPG-Connection-Id
403 invalid_connection — connection is invalid, revoked or belongs to another app
403 missing_scope — permission is not present in both key and merchant grant
429 rate_limited — rate limit reached
409 idempotency_conflict — same Idempotency-Key used with different content

OpenAPI: https://rpgcapital.com.br/openapi.json
Human docs: https://rpgcapital.com.br/developers/docs
`

export async function GET() {
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' } })
}
