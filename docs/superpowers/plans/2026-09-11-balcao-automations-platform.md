# Balcão Automations Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a área de Automações do Balcão, o perfil TI, permissões de equipe, API pública versionada, chaves de API, webhooks, integração com sistemas externos e documentação, mantendo o produto como software puro e sem movimentação bancária.

**Architecture:** Manter Next.js + Supabase como monólito modular. Front interno e API pública compartilham serviços de aplicação; API externa nunca acessa diretamente o snapshot bruto do inventário. Eventos relevantes entram em uma outbox e são entregues por um worker de webhooks. Chaves são escopadas por negócio/loja e autorização é aplicada antes de qualquer acesso a dados.

**Tech Stack:** Next.js 16.2.4, React 19.2.4, TypeScript 5, Supabase/Postgres/RLS, Supabase Edge Functions, Zod 4.4.3, Node 24 CI.

**Spec:** `docs/superpowers/specs/2026-09-11-balcao-automations-platform-design.md`

## Global Constraints

- O Balcão permanece software puro nesta entrega.
- Não criar endpoints de Pix Out, pagamento, boleto, transferência, carteira ou escrita bancária.
- `manager` deve acessar todos os módulos e dados da operação da loja.
- Criar `it` como perfil padrão com acesso somente ao módulo Automações/Integrações.
- `custom` deve poder incluir o módulo Automações.
- Nenhum segredo completo pode ser persistido em texto puro ou reaparecer na UI após criação/rotação.
- Toda API pública deve ser versionada em `/api/public/v1`.
- Toda mutação externa repetível deve ser idempotente.
- Financeiro público é somente leitura e exige `finance:read`.
- A API pública não pode expor o snapshot interno bruto do inventário.
- Todo acesso deve permanecer isolado por `business_id`/`store_id`.
- Webhooks devem usar HMAC-SHA256, outbox e retry assíncrono.
- CI final: Accounts tests + inventory regression + production build em Node 24.

---

## File Structure

### Criar

```text
app/api/balcao/automations/api-keys/route.ts
app/api/balcao/automations/api-keys/[id]/route.ts
app/api/balcao/automations/api-keys/[id]/rotate/route.ts
app/api/balcao/automations/integrations/route.ts
app/api/balcao/automations/webhooks/route.ts
app/api/balcao/automations/webhooks/[id]/route.ts
app/api/balcao/automations/webhooks/[id]/rotate/route.ts
app/api/balcao/automations/webhooks/[id]/test/route.ts
app/api/balcao/automations/webhooks/[id]/deliveries/route.ts
app/api/public/v1/products/route.ts
app/api/public/v1/products/[id]/route.ts
app/api/public/v1/inventory/route.ts
app/api/public/v1/inventory/movements/route.ts
app/api/public/v1/sales/route.ts
app/api/public/v1/sales/[id]/route.ts
app/api/public/v1/finance/summary/route.ts
app/api/public/v1/finance/transactions/route.ts
app/api/public/v1/finance/card-settlements/route.ts
app/api/public/v1/pricing/recommendations/route.ts
app/api/public/v1/pricing/history/route.ts
app/api/public/v1/imports/products/route.ts
app/api/public/v1/imports/sales/route.ts
app/api/public/v1/imports/inventory-movements/route.ts
app/api/public/v1/exports/products.csv/route.ts
app/api/public/v1/exports/inventory.csv/route.ts
app/api/public/v1/exports/sales.csv/route.ts
app/api/public/v1/exports/transactions.csv/route.ts
app/inventory-v1/AutomationsHub.tsx
app/inventory-v1/automations/ApiKeysPanel.tsx
app/inventory-v1/automations/IntegrationsPanel.tsx
app/inventory-v1/automations/WebhooksPanel.tsx
app/inventory-v1/automations/IntegrationLogsPanel.tsx
lib/platform/auth/apiKeys.ts
lib/platform/auth/apiScopes.ts
lib/platform/auth/publicApiContext.ts
lib/platform/contracts/http.ts
lib/platform/contracts/products.ts
lib/platform/contracts/inventory.ts
lib/platform/contracts/sales.ts
lib/platform/contracts/finance.ts
lib/platform/contracts/pricing.ts
lib/platform/services/productsService.ts
lib/platform/services/inventoryService.ts
lib/platform/services/salesService.ts
lib/platform/services/financeReadService.ts
lib/platform/services/pricingService.ts
lib/platform/inventoryAdapter.ts
lib/platform/integrations/authority.ts
lib/platform/integrations/entityMappings.ts
lib/platform/integrations/ingestion.ts
lib/platform/events/eventTypes.ts
lib/platform/events/outbox.ts
lib/platform/webhooks/crypto.ts
lib/platform/webhooks/signing.ts
lib/platform/webhooks/delivery.ts
lib/platform/idempotency.ts
supabase/functions/balcao-webhook-dispatcher/index.ts
supabase/migrations/20260911_balcao_automations_platform.sql
tests/accounts/automationsAccess.test.ts
tests/accounts/apiKeys.test.ts
tests/accounts/publicApiAuth.test.ts
tests/accounts/publicApiRoutes.test.ts
tests/accounts/integrationIngestion.test.ts
tests/accounts/webhookSigning.test.ts
tests/accounts/webhookDelivery.test.ts
tests/accounts/automationsUi.test.ts
docs/api/README.md
docs/api/authentication.md
docs/api/scopes.md
docs/api/endpoints.md
docs/api/webhooks.md
docs/api/integrations.md
docs/api/openapi.yaml
docs/automations.md
```

### Modificar

```text
lib/accounts/access.ts
lib/accounts/statePolicy.ts
components/accounts/TeamManager.tsx
components/accounts/InventoryRoleGate.tsx
components/accounts/ManageShell.tsx
app/inventory-v1/InventoryV1.tsx
app/api/balcao/staff/route.ts
app/api/balcao/staff/[id]/route.ts
lib/accounts/validation.ts
lib/accounts/payloads.ts
lib/accounts/requestContext.ts
app/api/inventory/state/route.ts
lib/finance/dashboard.ts (somente adapter/exports se necessário; não alterar semântica contábil)
package.json somente se um script de teste agregado for necessário
```

---

### Task 1: Perfil TI, módulo Automações e matriz de permissões

**Files:**
- Modify: `lib/accounts/access.ts`
- Modify: `lib/accounts/validation.ts`
- Modify: `lib/accounts/payloads.ts`
- Test: `tests/accounts/automationsAccess.test.ts`

**Interfaces:**
- Produces: `StaffRole = 'stock' | 'cashier' | 'finance' | 'it' | 'manager' | 'custom'`
- Produces: `StaffModule = 'stock' | 'checkout' | 'finance' | 'automations'`
- Produces permissions: `automations.view`, `automations.manage`, `integrations.view`, `integrations.manage`, `api_keys.manage`, `webhooks.manage`

- [ ] **Step 1: Write failing role/permission tests**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { permissionsForRole, permissionsForModules } from '../../lib/accounts/access.ts'

test('IT only receives automations and integration permissions', () => {
  const permissions = permissionsForRole('it')
  assert.equal(permissions.has('automations.view'), true)
  assert.equal(permissions.has('automations.manage'), true)
  assert.equal(permissions.has('api_keys.manage'), true)
  assert.equal(permissions.has('webhooks.manage'), true)
  assert.equal(permissions.has('inventory.write'), false)
  assert.equal(permissions.has('checkout.sell'), false)
  assert.equal(permissions.has('analysis.financial'), false)
})

test('manager receives every store-level operational and management permission', () => {
  const permissions = permissionsForRole('manager')
  for (const permission of [
    'inventory.view', 'inventory.write', 'products.lookup', 'products.manage',
    'checkout.sell', 'sales.view', 'analysis.financial',
    'automations.view', 'automations.manage', 'integrations.view', 'integrations.manage',
    'api_keys.manage', 'webhooks.manage', 'team.manage', 'devices.manage',
    'stores.manage', 'settings.manage',
  ] as const) assert.equal(permissions.has(permission), true, permission)
})

test('custom automations module maps to automation permissions', () => {
  const permissions = permissionsForModules(['automations'])
  assert.equal(permissions.has('automations.view'), true)
  assert.equal(permissions.has('api_keys.manage'), true)
  assert.equal(permissions.has('inventory.write'), false)
})
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npx tsx --test tests/accounts/automationsAccess.test.ts
```

Expected: fail because `it`, `automations` and new permissions do not exist.

- [ ] **Step 3: Extend access types and role maps**

Implement in `lib/accounts/access.ts`:

```ts
export type StaffRole = 'stock' | 'cashier' | 'finance' | 'it' | 'manager' | 'custom'
export type StaffModule = 'stock' | 'checkout' | 'finance' | 'automations'
```

Add all six new permissions to `Permission`. Add the automations module map. Make `it` equal only to that module. Make `manager` the union of stock, checkout, finance, automations and store-management permissions.

- [ ] **Step 4: Extend payload/validation allowlists**

Accept `it` in role validation. Accept the six new permissions in custom permission validation. Reject unknown permission strings.

- [ ] **Step 5: Run tests GREEN**

```bash
npx tsx --test tests/accounts/automationsAccess.test.ts tests/accounts/validation.test.ts tests/accounts/payloads.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/accounts/access.ts lib/accounts/validation.ts lib/accounts/payloads.ts tests/accounts/automationsAccess.test.ts
git commit -m "feat: add IT and automations access model"
```

---

### Task 2: Persistência e segurança da plataforma de integrações

**Files:**
- Create: `supabase/migrations/20260911_balcao_automations_platform.sql`
- Modify: `app/api/balcao/staff/route.ts`
- Modify: `app/api/balcao/staff/[id]/route.ts`
- Test: `tests/accounts/automationsAccess.test.ts`
- Test: `tests/accounts/security.test.ts`

**Interfaces:**
- Produces tables: `balcao_api_keys`, `balcao_integration_connections`, `balcao_integration_entity_mappings`, `balcao_webhook_endpoints`, `balcao_event_outbox`, `balcao_webhook_deliveries`, `balcao_idempotency_records`

- [ ] **Step 1: Write migration contract tests**

Add assertions reading the SQL file and verifying that it contains:

```ts
for (const table of [
  'balcao_api_keys', 'balcao_integration_connections', 'balcao_integration_entity_mappings',
  'balcao_webhook_endpoints', 'balcao_event_outbox', 'balcao_webhook_deliveries',
  'balcao_idempotency_records',
]) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`))
```

Also assert the staff role constraint includes `'it'` and custom permission validator includes all six new permissions.

- [ ] **Step 2: Run RED**

```bash
npx tsx --test tests/accounts/automationsAccess.test.ts tests/accounts/security.test.ts
```

- [ ] **Step 3: Create migration**

Implement the exact table set from the design spec. Required constraints:

```sql
check (status in ('active','revoked','expired'))
check (kind in ('erp','pos','ecommerce','bi','custom'))
check (status in ('active','paused','error'))
```

Add indexes for `(business_id, created_at desc)`, `(store_id, created_at desc)`, outbox unpublished rows and deliveries due by `next_retry_at`.

- [ ] **Step 4: Apply server-only table policy**

For credential/outbox/delivery/idempotency tables:

```sql
alter table ... enable row level security;
revoke all on table ... from public, anon, authenticated;
grant all on table ... to service_role;
```

Expose management only through authenticated security-definer RPCs or Next.js server routes that validate Balcão context.

- [ ] **Step 5: Update staff RPC/route role allowlists**

Ensure create/update/list staff support `it` and custom automations permissions.

- [ ] **Step 6: Run GREEN**

```bash
npx tsx --test tests/accounts/automationsAccess.test.ts tests/accounts/security.test.ts tests/accounts/staffManagementServiceRole.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260911_balcao_automations_platform.sql app/api/balcao/staff tests/accounts
git commit -m "feat: add automations platform persistence"
```

---

### Task 3: UX de Equipe e navegação de Automações

**Files:**
- Modify: `components/accounts/TeamManager.tsx`
- Modify: `components/accounts/InventoryRoleGate.tsx`
- Modify: `components/accounts/ManageShell.tsx`
- Modify: `app/inventory-v1/InventoryV1.tsx`
- Create: `app/inventory-v1/AutomationsHub.tsx`
- Test: `tests/accounts/automationsUi.test.ts`

**Interfaces:**
- Produces: reusable `<AutomationsHub storeId={string} managementAccess={boolean} />`

- [ ] **Step 1: Write UI contract tests**

Assert source contains labels:

```ts
assert.match(teamSource, /<option value="it">TI<\/option>/)
assert.match(teamSource, /Automações/)
assert.match(manageSource, /'Automações'/)
assert.match(roleGateSource, /automations\.view/)
assert.match(automationsSource, /Preço Inteligente/)
assert.match(automationsSource, /Conectar outro sistema/)
assert.match(automationsSource, /Integração avançada/)
```

- [ ] **Step 2: Run RED**

```bash
npx tsx --test tests/accounts/automationsUi.test.ts
```

- [ ] **Step 3: Extend TeamManager**

Add TI to labels/select. Add `automations` to module labels. For `role === 'it'`, show explanatory copy. For `role === 'manager'`, show complete-store copy. For custom, render four module toggles.

- [ ] **Step 4: Extend InventoryRoleGate**

Add:

```ts
const canAutomations = can(permissions, 'automations.view')
```

Map navigation labels containing `automações` to this flag. `it` must resolve with only Automações visible.

- [ ] **Step 5: Add Automações to both navigation surfaces**

`ManageShell`: add `Automações` between Análises and Equipe.  
`InventoryV1`: add tab `'automations'` and render `AutomationsHub`.

- [ ] **Step 6: Implement AutomationsHub home**

Render four sections: Ativas, Disponíveis, Conexões de dados, Avançado. Initial cards:

- Preço Inteligente
- Conectar outro sistema
- Usar meus dados fora do Balcão
- Integração avançada

Do not expose technical jargon until the advanced card is opened.

- [ ] **Step 7: Run GREEN**

```bash
npx tsx --test tests/accounts/automationsUi.test.ts tests/accounts/inventoryOperationalShell.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add components/accounts app/inventory-v1 tests/accounts/automationsUi.test.ts
git commit -m "feat: add automations workspace and IT team role UX"
```

---

### Task 4: API scopes, geração segura de chave e contexto público

**Files:**
- Create: `lib/platform/auth/apiScopes.ts`
- Create: `lib/platform/auth/apiKeys.ts`
- Create: `lib/platform/auth/publicApiContext.ts`
- Create: `lib/platform/contracts/http.ts`
- Test: `tests/accounts/apiKeys.test.ts`
- Test: `tests/accounts/publicApiAuth.test.ts`

**Interfaces:**

```ts
export type ApiScope =
  | 'products:read' | 'products:write'
  | 'inventory:read' | 'inventory:write'
  | 'sales:read' | 'sales:ingest'
  | 'finance:read'
  | 'pricing:read' | 'pricing:write'
  | 'webhooks:manage'

export type PublicApiContext = {
  requestId: string
  keyId: string
  businessId: string
  storeId: string | null
  scopes: ReadonlySet<ApiScope>
}
```

- [ ] **Step 1: Write cryptography/scope tests**

Test that generated key starts with `rpg_live_`, database representation excludes plaintext secret, valid secret verifies, altered secret fails, revoked/expired key fails, missing scope returns forbidden.

- [ ] **Step 2: Run RED**

```bash
npx tsx --test tests/accounts/apiKeys.test.ts tests/accounts/publicApiAuth.test.ts
```

- [ ] **Step 3: Implement key generation**

Generate 32 random bytes. Format:

```ts
const publicKey = `rpg_live_${prefix}_${secret}`
```

Store SHA-256/HMAC or password-grade hash of the secret plus prefix; compare safely. Return plaintext only from create/rotate function.

- [ ] **Step 4: Implement public API auth context**

Parse Bearer token, resolve active key, enforce business/store and scope, update `last_used_at` asynchronously and emit request id.

- [ ] **Step 5: Add rate-limit interface**

Expose category selection:

```ts
export type ApiRateClass = 'read' | 'write' | 'export' | 'bulk'
```

with initial per-minute limits 120/30/12/20.

- [ ] **Step 6: Run GREEN and commit**

```bash
npx tsx --test tests/accounts/apiKeys.test.ts tests/accounts/publicApiAuth.test.ts
git add lib/platform tests/accounts/apiKeys.test.ts tests/accounts/publicApiAuth.test.ts
git commit -m "feat: add public API authentication and scopes"
```

---

### Task 5: Gerenciamento de chaves e integração na UI

**Files:**
- Create: `app/api/balcao/automations/api-keys/route.ts`
- Create: `app/api/balcao/automations/api-keys/[id]/route.ts`
- Create: `app/api/balcao/automations/api-keys/[id]/rotate/route.ts`
- Create: `app/inventory-v1/automations/ApiKeysPanel.tsx`
- Modify: `app/inventory-v1/AutomationsHub.tsx`
- Test: `tests/accounts/apiKeys.test.ts`
- Test: `tests/accounts/automationsUi.test.ts`

**Interfaces:**
- `POST /api/balcao/automations/api-keys` returns `{ key, apiKey }` only on creation.
- `GET` returns metadata only, never full key.
- `DELETE` revokes immediately.
- `POST /{id}/rotate` revokes previous secret and returns new secret once.

- [ ] **Step 1: Add failing management route tests**

Verify permission `api_keys.manage`; IT allowed; cashier forbidden; response after GET cannot contain `secret` or full key.

- [ ] **Step 2: Run RED**

```bash
npx tsx --test tests/accounts/apiKeys.test.ts
```

- [ ] **Step 3: Implement routes with audit events**

Emit:

- `api_key.created`
- `api_key.revoked`
- `api_key.rotated`

Sensitive scopes (`finance:read`, any write/ingest) require manager/owner/admin approval state before activation when requested by IT.

- [ ] **Step 4: Implement ApiKeysPanel**

Creation form fields:

- Nome da conexão
- Loja ou negócio
- Permissões grouped by Produtos/Estoque/Vendas/Financeiro/Preços/Webhooks
- Expiração: sem expiração, 30, 90, 365 dias

After create, render blocking one-time secret panel with copy button and warning that it cannot be displayed again.

- [ ] **Step 5: Run GREEN and commit**

```bash
npx tsx --test tests/accounts/apiKeys.test.ts tests/accounts/automationsUi.test.ts
git add app/api/balcao/automations app/inventory-v1/automations app/inventory-v1/AutomationsHub.tsx tests/accounts
git commit -m "feat: add API key management"
```

---

### Task 6: Contratos públicos, adapters e endpoints read-only

**Files:**
- Create contracts/services/adapters under `lib/platform/`
- Create public routes for products, inventory, sales, finance and pricing listed in File Structure
- Test: `tests/accounts/publicApiRoutes.test.ts`

**Interfaces:**

```ts
export type PublicListMeta = { requestId: string; nextCursor: string | null }
export type PublicSuccess<T> = { data: T; meta: PublicListMeta }
```

All monetary amounts use cents; all fractional stock uses milli-units.

- [ ] **Step 1: Write failing service/route tests**

Cover:

- `GET products` with `products:read` returns sanitized product contract.
- snapshot internals are not returned.
- `GET sales` needs `sales:read`.
- `GET finance/summary` needs `finance:read`.
- store A key cannot select store B.
- default limit 100; max 250; cursor returned.

- [ ] **Step 2: Run RED**

```bash
npx tsx --test tests/accounts/publicApiRoutes.test.ts
```

- [ ] **Step 3: Implement InventoryAdapter**

Read the current inventory RPC/snapshot and map it to stable entities. Public contracts must not expose `scaleRule`, local-storage concerns or arbitrary internal JSON.

- [ ] **Step 4: Implement service layer**

Each service accepts `PublicApiContext` and domain filters and returns contract DTOs. FinanceReadService may reuse the current finance dashboard source/logic but must return API DTOs, not React dashboard shape.

- [ ] **Step 5: Implement thin route handlers**

Pattern:

```ts
const ctx = await authorizePublicApi(request, 'products:read', 'read')
const result = await productsService.list(ctx, filters)
return publicSuccess(result.data, ctx.requestId, result.nextCursor)
```

- [ ] **Step 6: Run GREEN and commit**

```bash
npx tsx --test tests/accounts/publicApiRoutes.test.ts tests/accounts/financeDashboard.test.ts
git add app/api/public/v1 lib/platform tests/accounts/publicApiRoutes.test.ts
git commit -m "feat: add read-only public data API"
```

---

### Task 7: CSV/Excel exports

**Files:**
- Create CSV export routes listed in File Structure
- Modify: `app/inventory-v1/AutomationsHub.tsx`
- Test: `tests/accounts/publicApiRoutes.test.ts`

- [ ] **Step 1: Add failing tests**

Verify `Content-Type: text/csv; charset=utf-8`, UTF-8 BOM for Excel compatibility, quoted fields and scope enforcement.

- [ ] **Step 2: Run RED**

```bash
npx tsx --test tests/accounts/publicApiRoutes.test.ts
```

- [ ] **Step 3: Implement export serializers**

Products columns: id, barcode, name, brand, unit, price, average_cost, stock, min_stock.  
Sales columns: sale_id, date, product_id, product_name, quantity, gross_sales, cogs, gross_profit, payment_method.  
Transactions columns: date, amount, description, counterparty, category, source.

- [ ] **Step 4: Add “Usar meus dados fora do Balcão” UX**

Offer buttons for Products CSV, Inventory CSV, Sales CSV, Transactions CSV and advanced API access.

- [ ] **Step 5: Run GREEN and commit**

```bash
npx tsx --test tests/accounts/publicApiRoutes.test.ts tests/accounts/automationsUi.test.ts
git add app/api/public/v1/exports app/inventory-v1/AutomationsHub.tsx tests/accounts
git commit -m "feat: add spreadsheet-friendly exports"
```

---

### Task 8: Integrações, autoridade, mapeamentos e idempotência

**Files:**
- Create: `lib/platform/integrations/authority.ts`
- Create: `lib/platform/integrations/entityMappings.ts`
- Create: `lib/platform/integrations/ingestion.ts`
- Create: `lib/platform/idempotency.ts`
- Create: `app/api/balcao/automations/integrations/route.ts`
- Create import routes listed in File Structure
- Create: `app/inventory-v1/automations/IntegrationsPanel.tsx`
- Test: `tests/accounts/integrationIngestion.test.ts`

**Interfaces:**

```ts
export type DomainAuthority = {
  products: 'balcao' | 'external' | 'merge'
  inventory: 'balcao' | 'external'
  sales: 'balcao' | 'external'
  pricing: 'balcao' | 'external'
  finance: 'balcao'
}
```

- [ ] **Step 1: Write failing authority/idempotency tests**

Test external product source accepted only if authority permits; duplicate sale with same idempotency key returns same result; same key/different payload -> `409`.

- [ ] **Step 2: Run RED**

```bash
npx tsx --test tests/accounts/integrationIngestion.test.ts
```

- [ ] **Step 3: Implement authority and mapping services**

Do not use EAN as sole identity. Require/use external id mapping for external systems and persist provenance.

- [ ] **Step 4: Implement idempotency storage**

Hash idempotency key and request body. Retain records for 7 days.

- [ ] **Step 5: Implement bulk import routes**

Maximum 500 records and 5 MB. Required scopes:

- products -> `products:write`
- sales -> `sales:ingest`
- inventory movements -> `inventory:write`

- [ ] **Step 6: Implement integration wizard**

Steps: type -> direction -> data -> authority -> test/activate. Show human language first.

- [ ] **Step 7: Run GREEN and commit**

```bash
npx tsx --test tests/accounts/integrationIngestion.test.ts tests/accounts/publicApiRoutes.test.ts
git add lib/platform/integrations lib/platform/idempotency.ts app/api/public/v1/imports app/api/balcao/automations/integrations app/inventory-v1/automations/IntegrationsPanel.tsx tests/accounts
git commit -m "feat: add external data ingestion and integration authority"
```

---

### Task 9: Eventos internos e transactional outbox

**Files:**
- Create: `lib/platform/events/eventTypes.ts`
- Create: `lib/platform/events/outbox.ts`
- Modify existing sale/product/inventory/finance paths only at successful commit points
- Test: `tests/accounts/webhookDelivery.test.ts`

**Interfaces:**

```ts
export type BalcaoEventType =
  | 'product.created' | 'product.updated' | 'product.archived'
  | 'inventory.movement.created' | 'inventory.low_stock'
  | 'sale.created'
  | 'pricing.recommendation.created' | 'pricing.price.changed'
  | 'finance.transaction.created' | 'finance.card_settlement.detected'
  | 'integration.sync.completed' | 'integration.sync.failed'
  | 'webhook.test'
```

- [ ] **Step 1: Write RED tests**

Assert a successful sale schedules exactly one `sale.created`; a failed transaction schedules none; event contains business/store and sanitized `data`.

- [ ] **Step 2: Run RED**

```bash
npx tsx --test tests/accounts/webhookDelivery.test.ts
```

- [ ] **Step 3: Implement outbox writer**

`enqueueEvent()` receives context, type, aggregate and payload. Store event with `published_at = null`.

- [ ] **Step 4: Wire event emission**

Emit only after successful domain persistence. Avoid event emission on local React-only state before server success.

- [ ] **Step 5: Run GREEN and commit**

```bash
npx tsx --test tests/accounts/webhookDelivery.test.ts tests/accounts/checkoutPayments.test.ts
git add lib/platform/events app/api/inventory app/api/balcao tests/accounts/webhookDelivery.test.ts
git commit -m "feat: add platform event outbox"
```

---

### Task 10: Webhook crypto, management API and UI

**Files:**
- Create webhook crypto/signing files
- Create webhook management routes listed in File Structure
- Create: `app/inventory-v1/automations/WebhooksPanel.tsx`
- Test: `tests/accounts/webhookSigning.test.ts`
- Test: `tests/accounts/automationsUi.test.ts`

**Interfaces:**

```ts
export function signWebhook(secret: string, timestamp: string, rawBody: string): string
export function verifyWebhookSignature(secret: string, timestamp: string, rawBody: string, signature: string): boolean
```

- [ ] **Step 1: Write signature tests**

Same secret/timestamp/body produces same signature; body change fails; signature comparison does not use plain string equality.

- [ ] **Step 2: Run RED**

```bash
npx tsx --test tests/accounts/webhookSigning.test.ts
```

- [ ] **Step 3: Implement webhook secret encryption**

Use AES-256-GCM with server secret `BALCAO_WEBHOOK_MASTER_KEY`. Persist IV/auth tag/ciphertext in `secret_ciphertext`. Show plaintext only at creation/rotation.

- [ ] **Step 4: Implement management routes**

Validate HTTPS in production and block loopback/private network destinations. Require `webhooks.manage`.

- [ ] **Step 5: Implement WebhooksPanel**

Create/edit endpoint, event checkboxes, test event, rotate secret, pause/resume, deliveries list. Never re-render old secret.

- [ ] **Step 6: Run GREEN and commit**

```bash
npx tsx --test tests/accounts/webhookSigning.test.ts tests/accounts/automationsUi.test.ts
git add lib/platform/webhooks app/api/balcao/automations/webhooks app/inventory-v1/automations/WebhooksPanel.tsx tests/accounts
git commit -m "feat: add webhook configuration and signing"
```

---

### Task 11: Webhook dispatcher, retries and auto-pause

**Files:**
- Create: `lib/platform/webhooks/delivery.ts`
- Create: `supabase/functions/balcao-webhook-dispatcher/index.ts`
- Extend migration with claim/retry RPCs if not already present
- Test: `tests/accounts/webhookDelivery.test.ts`

**Interfaces:**

Retry offsets:

```ts
export const WEBHOOK_RETRY_SECONDS = [30, 120, 600, 3600, 21600] as const
```

- [ ] **Step 1: Add failing retry tests**

Cover 2xx success, 500 retry, timeout retry, fifth failure finalizes delivery, and 20 consecutive failed deliveries pauses endpoint.

- [ ] **Step 2: Run RED**

```bash
npx tsx --test tests/accounts/webhookDelivery.test.ts
```

- [ ] **Step 3: Implement atomic claim RPC**

Use `FOR UPDATE SKIP LOCKED` to claim due outbox/delivery rows so two workers cannot send the same attempt concurrently.

- [ ] **Step 4: Implement Edge Function dispatcher**

Worker flow:

```text
claim batch -> resolve subscribed endpoints -> decrypt secret -> sign body -> POST with timeout -> record result -> schedule retry or success
```

Headers: `X-RPG-Event-Id`, `X-RPG-Timestamp`, `X-RPG-Signature`.

- [ ] **Step 5: Configure scheduled execution**

Use Supabase scheduling for the Edge Function at 1-minute cadence. Keep endpoint dispatch code independent of scheduler so it can later move to another worker without changing outbox format.

- [ ] **Step 6: Run GREEN and commit**

```bash
npx tsx --test tests/accounts/webhookDelivery.test.ts tests/accounts/webhookSigning.test.ts
git add lib/platform/webhooks supabase/functions/balcao-webhook-dispatcher supabase/migrations/20260911_balcao_automations_platform.sql tests/accounts
git commit -m "feat: deliver signed webhooks with retries"
```

---

### Task 12: Logs de integração e observabilidade

**Files:**
- Create: `app/inventory-v1/automations/IntegrationLogsPanel.tsx`
- Modify management endpoints to expose sanitized metadata
- Test: `tests/accounts/automationsUi.test.ts`
- Test: `tests/accounts/security.test.ts`

- [ ] **Step 1: Add failing tests**

Ensure response/log views never contain `secret_hash`, `secret_ciphertext`, authorization headers or full API keys.

- [ ] **Step 2: Run RED**

```bash
npx tsx --test tests/accounts/security.test.ts tests/accounts/automationsUi.test.ts
```

- [ ] **Step 3: Implement sanitized logs**

Expose timestamp, integration/key prefix, route/event, status, duration, request/event id and safe error summary.

- [ ] **Step 4: Run GREEN and commit**

```bash
npx tsx --test tests/accounts/security.test.ts tests/accounts/automationsUi.test.ts
git add app/inventory-v1/automations app/api/balcao/automations tests/accounts
git commit -m "feat: add safe integration observability"
```

---

### Task 13: Documentação pública e OpenAPI

**Files:**
- Create all `docs/api/*`
- Create: `docs/automations.md`

- [ ] **Step 1: Write API landing documentation**

`docs/api/README.md` explains software-only scope, base URL, auth, request IDs, versioning, rate limits and links to each topic.

- [ ] **Step 2: Write authentication/scopes documentation**

Include actual header example:

```bash
curl -H "Authorization: Bearer rpg_live_EXAMPLE_REDACTED" \
  https://www.rpgcapital.com.br/api/public/v1/products
```

Explain one-time secrets, revocation, expiration and sensitive-scope approval.

- [ ] **Step 3: Write endpoint documentation**

For every public route list method, required scope, filters, sample request, sample response and error codes.

- [ ] **Step 4: Write webhook documentation**

Document event names, payload envelope, HMAC algorithm, retry schedule and verification example.

- [ ] **Step 5: Write integration cookbook**

Examples:

- ERP manda products/sales/inventory to Balcão.
- Balcão read-only -> Excel/Power BI.
- ERP external source of truth + Balcão pricing recommendations.

- [ ] **Step 6: Create `openapi.yaml`**

Declare all `/v1` routes, bearer auth, schemas, scopes, pagination and error envelope. Do not declare payment endpoints.

- [ ] **Step 7: Commit**

```bash
git add docs/api docs/automations.md
git commit -m "docs: publish Balcao integration API documentation"
```

---

### Task 14: Full verification, security review and deployment gate

**Files:**
- No product changes unless verification exposes a defect.

- [ ] **Step 1: Run Accounts tests**

```bash
npx tsx --test tests/accounts/*.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run inventory regression suite**

```bash
npx tsx --test tests/nfeKey.test.ts tests/nfe.test.ts tests/purchaseMath.test.ts tests/productMatcher.test.ts tests/invoiceReview.test.ts tests/catalog*.test.ts tests/productLifecycle.test.ts
```

Expected: all PASS.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: Next.js build succeeds with no TypeScript errors.

- [ ] **Step 4: Run authorization matrix manually/automated**

Verify:

```text
Cashier -> Caixa only
Stock -> Estoque/Entrada only
Finance -> Financeiro only
IT -> Automações only
Manager -> all store modules + management
Custom(Automations) -> Automações only
```

- [ ] **Step 5: Run API security matrix**

Verify:

```text
valid products:read -> products 200
missing products:read -> 403
revoked key -> 401
expired key -> 401
store A -> store B -> denied
finance without finance:read -> 403
/payment path -> 404
/pix path under public v1 -> 404
```

- [ ] **Step 6: Run idempotency scenario**

Post the same external sale twice with the same `Idempotency-Key`; assert one sale and identical API response. Reuse same key with changed payload; assert 409.

- [ ] **Step 7: Run webhook end-to-end scenario**

Create test endpoint, trigger `webhook.test`, verify event id/timestamp/signature, return 500 once, confirm retry scheduling, then return 200 and confirm delivered status.

- [ ] **Step 8: Verify secret handling**

Search generated responses/logs for `rpg_live_` full secrets and webhook plaintext secrets. Only the one-time creation/rotation response may contain them.

- [ ] **Step 9: Open PR with verification evidence**

PR description must include:

- architecture summary;
- migration summary;
- role matrix;
- public endpoints/scopes;
- webhook events/retries;
- exact test/build commands and results;
- statement that no payment/money-movement API was introduced.

- [ ] **Step 10: Preview verification before merge**

Test the preview with owner/manager/IT/custom personas and real API calls against test data. Merge only after CI green and preview approval.
