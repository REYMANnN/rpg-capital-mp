# BALCÃO v10.4 Universal Product Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace BALCÃO's two-source product lookup with a resilient universal EAN/GTIN resolver that grows BALCÃO's own catalog, enriches products best-effort, and supports batch resolution for large stock intake.

**Architecture:** Keep the existing UI and `/api/products/lookup` contract stable while moving provider-specific code into `lib/inventory/catalog/`. Providers normalize into one canonical candidate type, a deterministic merge/category layer produces a final product, the route reads/writes BALCÃO's catalog cache, and a new batch endpoint resolves only cache misses with bounded concurrency. Scarce providers are protected by local budget/rate guards and all external failures degrade to other providers/manual entry.

**Tech Stack:** Next.js App Router, TypeScript, native `fetch`/`AbortController`, Supabase/Postgres, Node test runner via `tsx`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-29-inventory-v10-4-universal-product-resolver-design.md`

## Global Constraints

- Keep versioning in the v10.x line; this release is `v10.4`.
- No new mandatory inventory form fields.
- Category and enrichment never block stock intake, NF-e review, or checkout setup.
- Normal barcode lookup uses no LLM.
- External URLs are constants and all provider calls are server-side.
- Preserve current single-product API compatibility: `found`, `source`, `cached`, and `product.barcode/name/brand/imageUrl`.
- BALCÃO cache is checked before any provider and every usable external result grows the cache.
- Manual/first-party canonical corrections must outrank external enrichment.
- Batch endpoint maximum: 100 unique barcodes/request; internal concurrency must be much smaller.
- Provider outages, malformed payloads, timeouts, 401/403/404/429/5xx must never break the whole lookup.
- Existing inventory, NF-e, supplier alias, checkout, soft-delete/reactivation, pending-price, branding, and cloud-sync tests remain green.

---

## File structure

### New catalog core
- `lib/inventory/catalog/types.ts` — provider/result/status contracts and canonical result type.
- `lib/inventory/catalog/normalize.ts` — GTIN/string/list/number normalization helpers.
- `lib/inventory/catalog/category.ts` — deterministic broad-category mapping.
- `lib/inventory/catalog/merge.ts` — deterministic field-level merge and provenance.
- `lib/inventory/catalog/budget.ts` — in-process scarce-provider guards.
- `lib/inventory/catalog/resolver.ts` — Wave A/Wave B orchestration, deadlines, status summaries.

### New provider adapters
- `lib/inventory/catalog/providers/openFacts.ts`
- `lib/inventory/catalog/providers/productGuru.ts`
- `lib/inventory/catalog/providers/barcodeFinder.ts`
- `lib/inventory/catalog/providers/gtinSearch.ts`
- `lib/inventory/catalog/providers/upcItemDb.ts`
- `lib/inventory/catalog/providers/produtoXyz.ts`
- `lib/inventory/catalog/providers/brocade.ts`
- `lib/inventory/catalog/providers/eanPictures.ts`

Each provider file exports a payload normalizer that is fixture-testable without network and a fetch adapter with a constant endpoint + AbortController timeout.

### API/cache
- Modify `app/api/products/lookup/route.ts` — thin validation/cache/resolver transport.
- Create `app/api/products/lookup/batch/route.ts` — cache-first multi-EAN endpoint.
- Modify `lib/inventory/version.ts` — `v10.4`.

### Database
- Supabase migration: add `manufacturer`, `category_general`, `category_raw`, `confidence_score`, `cache_status`, `miss_expires_at`, and `canonical_updated_at` to `inventory_v1_product_catalog_cache` as nullable/additive columns.

### Tests
- `tests/catalogNormalize.test.ts`
- `tests/catalogCategory.test.ts`
- `tests/catalogMerge.test.ts`
- `tests/catalogProviders.test.ts`
- `tests/catalogResolver.test.ts`
- `tests/catalogBatch.test.ts`
- `tests/v10_4UniversalLookup.test.ts`
- Modify `.github/workflows/inventory-v10-1-ci.yml` to include the v10.4 branch/tests while retaining all existing v10.x tests.

---

### Task 1: Canonical catalog contracts, normalization, category, merge

**Files:**
- Create: `lib/inventory/catalog/types.ts`
- Create: `lib/inventory/catalog/normalize.ts`
- Create: `lib/inventory/catalog/category.ts`
- Create: `lib/inventory/catalog/merge.ts`
- Test: `tests/catalogNormalize.test.ts`
- Test: `tests/catalogCategory.test.ts`
- Test: `tests/catalogMerge.test.ts`

**Interfaces:**
- Produces `CatalogProvider`, `ProviderOutcome`, `CatalogCandidate`, `CatalogProduct`, `ProviderAttempt`, `CatalogResolveResult`.
- Produces `normalizeBarcode(raw: unknown): string`, `cleanText(raw: unknown): string`, `cleanStringList(raw: unknown): string[]`.
- Produces `classifyGeneralCategory(...values: Array<string | undefined>): GeneralCategory`.
- Produces `mergeCatalogCandidates(barcode: string, candidates: CatalogCandidate[], canonical?: Partial<CatalogProduct> & { authority?: 'manual' | 'external' }): CatalogProduct | null`.

- [ ] **Step 1: Write failing normalization/category/merge tests**

```ts
assert.equal(normalizeBarcode(' 7891000376843 '), '7891000376843')
assert.equal(normalizeBarcode('ABC'), '')
assert.equal(classifyGeneralCategory('smartphones electronics'), 'Eletrônicos')
assert.equal(classifyGeneralCategory(''), 'Não classificado')

const merged = mergeCatalogCandidates('7891000376843', [
  { barcode: '7891000376843', provider: 'ProductGuru', name: 'Bono Chocolate 90g', brand: 'Nestlé' },
  { barcode: '7891000376843', provider: 'UPCitemdb', imageUrl: 'https://img.example/bono.jpg', categoryRaw: 'Food' },
])
assert.equal(merged?.name, 'Bono Chocolate 90g')
assert.equal(merged?.imageUrl, 'https://img.example/bono.jpg')
assert.equal(merged?.categoryGeneral, 'Alimentos e bebidas')
```

- [ ] **Step 2: Run tests and verify RED**

Run:
`npx tsx --test tests/catalogNormalize.test.ts tests/catalogCategory.test.ts tests/catalogMerge.test.ts`

Expected: FAIL because catalog core modules do not exist.

- [ ] **Step 3: Implement minimal core**

Canonical provider names:
`OpenFacts | ProductGuru | BarcodeFinder | GTINSearch | UPCitemdb | ProdutoXYZ | Brocade | EanPictures | BALCAO`.

Provider outcomes:
`hit | miss | rate_limited | timeout | unavailable | invalid_response`.

Broad category values exactly match the spec.

Merge must:
- require a usable name for final resolution;
- preserve a manually authoritative canonical `name/brand/manufacturer/category/image` when supplied;
- fill missing fields from candidates in deterministic provider rank order;
- keep `imageUrls` unique;
- attach provenance per accepted field;
- compute a bounded 0–1 confidence score from source rank + agreement + completeness.

- [ ] **Step 4: Run tests and verify GREEN**

- [ ] **Step 5: Commit core**

Commit message: `feat: add universal catalog core`

---

### Task 2: Provider payload adapters and resilient network wrapper

**Files:**
- Create all eight `lib/inventory/catalog/providers/*.ts` files listed above.
- Test: `tests/catalogProviders.test.ts`

**Interfaces:**
Each adapter exports:

```ts
export function normalize<ProviderName>Payload(barcode: string, payload: unknown): CatalogCandidate | null
export async function lookup<ProviderName>(barcode: string, signal?: AbortSignal): Promise<ProviderAttempt>
```

`ProviderAttempt` contains provider, outcome, durationMs, optional HTTP status, and optional candidate.

- [ ] **Step 1: Write fixture-based failing tests**

Tests cover at least one representative hit and one malformed/miss payload for every provider. The fixtures assert only fields documented/observed by each public source and use defensive alternate field names where upstream schemas are inconsistent.

- [ ] **Step 2: Run provider tests and verify RED**

Run: `npx tsx --test tests/catalogProviders.test.ts`

- [ ] **Step 3: Implement adapters**

Endpoints:
- Open Facts: `https://world.openfoodfacts.org/api/v3/product/{EAN}?product_type=all`
- ProductGuru: `https://myproduct.guru/scan/{EAN}`
- BarcodeFinder: `https://api.barcodefinder.info/barcode/{EAN}`
- GTINSearch: `https://www.gtinsearch.org/api/items/{EAN}`
- UPCitemdb: `https://api.upcitemdb.com/prod/trial/lookup?upc={EAN}`
- ProdutoXYZ: `https://produto.xyz/v1/gtin/{EAN}`
- Brocade: `https://www.brocade.io/api/items/{EAN}`
- EanPictures data: `http://www.eanpictures.com.br:9000/api/desc/{EAN}`
- EanPictures image: `http://www.eanpictures.com.br:9000/api/gtin/{EAN}`

All adapters:
- validate barcode before fetch;
- use constant URLs only;
- have their own timeout (default 3s; Brocade/EanPictures 2s);
- convert 404/empty product to `miss`;
- convert 429 to `rate_limited`;
- convert abort to `timeout`;
- convert 5xx/network errors to `unavailable`;
- convert schema surprises to `invalid_response`;
- never throw provider errors to resolver callers.

Open Facts sends BALCÃO-identifying User-Agent.

- [ ] **Step 4: Run provider tests and verify GREEN**

- [ ] **Step 5: Commit providers**

Commit: `feat: add universal product providers`

---

### Task 3: Resolver waves, deadlines, and scarce-provider budget

**Files:**
- Create: `lib/inventory/catalog/budget.ts`
- Create: `lib/inventory/catalog/resolver.ts`
- Test: `tests/catalogResolver.test.ts`

**Interfaces:**

```ts
export type ResolverDependencies = {
  waveA?: CatalogLookup[]
  waveB?: CatalogLookup[]
  now?: () => number
}

export async function resolveUniversalProduct(
  barcode: string,
  options?: { totalDeadlineMs?: number; dependencies?: ResolverDependencies },
): Promise<CatalogResolveResult>
```

- [ ] **Step 1: Write failing resolver tests**

Cover:
- Wave A strong identity skips Wave B;
- weak/no Wave A identity invokes Wave B;
- one provider hit succeeds despite other failures;
- fields merge from multiple providers;
- total deadline returns best completed candidate;
- UPCitemdb budget exhaustion cleanly skips the provider.

- [ ] **Step 2: Verify RED**

Run: `npx tsx --test tests/catalogResolver.test.ts`

- [ ] **Step 3: Implement resolver**

Wave A: OpenFacts, ProductGuru, GTINSearch, ProdutoXYZ, EanPictures, Brocade.
Wave B: BarcodeFinder, UPCitemdb.

Run Wave A concurrently with `Promise.allSettled`-style isolation under a total resolver deadline. A usable name from a high-value Wave A result resolves identity and skips Wave B. If Wave A has only partial enrichment/no name, use Wave B.

Budget guard requirements for UPCitemdb:
- at most one concurrent lookup;
- minimum ~10s spacing inside a warm server process;
- cap of 100 attempts per UTC day in memory;
- budget exhaustion returns `rate_limited`/skipped rather than throwing.

Because serverless instances are ephemeral, this in-memory guard is a local safety layer, not a global billing-grade quota. Batch logic must also avoid duplicate UPCitemdb requests.

- [ ] **Step 4: Verify GREEN**

- [ ] **Step 5: Commit resolver**

Commit: `feat: orchestrate universal catalog resolver`

---

### Task 4: Extend BALCÃO catalog cache safely

**Files:**
- Database migration in Supabase production project.
- Modify: `app/api/products/lookup/route.ts`
- Test: `tests/v10_4UniversalLookup.test.ts`

**Interfaces:**
The route returns the same legacy shape plus optional enrichment:

```ts
{
  found: true,
  source: string,
  cached: boolean,
  product: {
    barcode: string,
    name: string,
    brand: string,
    imageUrl: string,
    manufacturer?: string,
    categoryGeneral?: GeneralCategory,
    categoryRaw?: string,
    confidence?: number,
  }
}
```

- [ ] **Step 1: Write failing route-contract test**

Test source code/contract for cache-first behavior, resolver delegation, enriched persistence, backward-compatible response, and negative-cache branch.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Apply additive Supabase migration**

Add nullable columns:
- `manufacturer text`
- `category_general text`
- `category_raw text`
- `confidence_score numeric`
- `cache_status text not null default 'hit'` with allowed operational values `hit|miss`
- `miss_expires_at timestamptz`
- `canonical_updated_at timestamptz`

Do not delete or rewrite existing rows.

- [ ] **Step 4: Refactor single lookup route**

Behavior:
1. validate normalized 8–14 digit code;
2. read cache;
3. if cached hit with usable name, return immediately;
4. if cached miss and `miss_expires_at > now()`, return `found:false` without providers;
5. call `resolveUniversalProduct` on cache miss;
6. on hit, upsert canonical fields + full resolver provenance/status metadata;
7. on miss, upsert short negative-cache marker (start at ~6h);
8. never replace a row marked manual authority in `raw_metadata` with lower-authority external identity fields;
9. preserve old client fields exactly.

- [ ] **Step 5: Verify route tests GREEN**

- [ ] **Step 6: Commit cache/route**

Commit: `feat: cache universal product resolutions`

---

### Task 5: Batch lookup for large stock intake

**Files:**
- Create: `app/api/products/lookup/batch/route.ts`
- Create or extend helper in `lib/inventory/catalog/resolver.ts` for bounded concurrency.
- Test: `tests/catalogBatch.test.ts`

**Interfaces:**

Request:
```json
{ "barcodes": ["789...", "789..."] }
```

Response:
```json
{
  "ok": true,
  "results": [
    { "barcode": "789...", "found": true, "cached": true, "product": {} },
    { "barcode": "789...", "found": false, "cached": false }
  ]
}
```

- [ ] **Step 1: Write failing batch tests**

Cover validation, 100-unique max, internal dedupe, original-order reconstruction including duplicates, mixed cache hit/miss, partial success, and concurrency cap.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement batch route**

Rules:
- body must contain array;
- normalize each item;
- reject request only for malformed body/over-limit unique valid codes; individual invalid codes return `found:false` with `error:'invalid_barcode'`;
- one Supabase `.in('barcode', uniqueCodes)` cache query;
- resolve only cache misses;
- product-level resolver concurrency starts at 4;
- reuse the same scarce-provider budget guard across the request/process;
- upsert resolved hits/miss markers in grouped operations where possible;
- stable output order exactly matches input order;
- no single product failure fails the batch.

- [ ] **Step 4: Verify GREEN**

- [ ] **Step 5: Commit batch**

Commit: `feat: add batch universal product lookup`

---

### Task 6: Version, regression CI, and production verification

**Files:**
- Modify: `lib/inventory/version.ts`
- Modify: `.github/workflows/inventory-v10-1-ci.yml`
- Test: `tests/v10_4UniversalLookup.test.ts`

- [ ] **Step 1: Advance version to `v10.4`**

- [ ] **Step 2: Add new tests to CI while retaining every existing v10.x test**

CI command must include all old tests plus:
`tests/catalogNormalize.test.ts tests/catalogCategory.test.ts tests/catalogMerge.test.ts tests/catalogProviders.test.ts tests/catalogResolver.test.ts tests/catalogBatch.test.ts tests/v10_4UniversalLookup.test.ts`

- [ ] **Step 3: Run full tests**

Expected: zero failures.

- [ ] **Step 4: Run `npm run build`**

Expected: production build success.

- [ ] **Step 5: Verify Supabase columns and a harmless state/version read**

- [ ] **Step 6: Promote tested branch head to `master` only after test + build success**

- [ ] **Step 7: Trigger the existing real Git-push production deployment path**

- [ ] **Step 8: Verify public production**

Check:
- `/api/inventory/state` responds `version:"v10.4"`;
- `/api/products/lookup?barcode=<known test EAN>` returns a backward-compatible response;
- production page still renders BALCÃO;
- no claim of physical camera testing.

- [ ] **Step 9: Commit/release marker if required by the existing deployment workflow**

Release is complete only when public production, not merely GitHub, shows v10.4.
