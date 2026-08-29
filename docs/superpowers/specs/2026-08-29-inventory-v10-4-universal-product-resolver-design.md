# BALCÃO v10.4 — Universal Product Resolver

Date: 2026-08-29
Status: design approved in chat; awaiting written-spec review

## 1. Goal

Turn BALCÃO's current product lookup into a universal EAN/GTIN resolver for the widest practical set of retail products, while preserving the current simple mercadinho workflow.

The system must continue to work even when only the barcode and a manually entered name are available. Category, image, manufacturer and other metadata are best-effort enrichment and must never block stock intake, checkout setup or NF-e review.

Primary product families include, but are not limited to:

- food and beverages;
- hygiene and beauty;
- household cleaning;
- household goods and utensils;
- health products and medicines when present in general GTIN databases;
- clothing and apparel;
- electronics;
- pet products;
- books/media;
- hardware/home products;
- any other retail item represented by a valid GTIN/EAN/UPC.

This is commercial product identification, not a regulatory medication database. No medical or ANVISA completeness claim is made.

## 2. Existing system

The current `/api/products/lookup?barcode=...` endpoint:

1. validates an 8–14 digit barcode;
2. checks `inventory_v1_product_catalog_cache`;
3. queries Open Food Facts;
4. queries Open Products Facts;
5. caches the first usable result;
6. returns normalized `barcode`, `name`, `brand`, `imageUrl`.

The current cache already stores barcode, name, brand, image URL, source, raw metadata, system tag and check timestamp. This gives v10.4 a stable migration path: inventory, checkout and NF-e flows do not need to know which external provider supplied the identification.

## 3. Design principles

### 3.1 Mercadinho-first UX

No new mandatory form fields are introduced. The user scans the barcode exactly as today.

A successful universal lookup should make the experience feel faster, not more complex.

### 3.2 Maximum coverage, graceful degradation

No provider is trusted as a single source of truth. Any provider can time out, change schema, return 404, rate-limit, disappear or contain incomplete data.

Provider failure must never fail the whole lookup. The resolver continues to the next provider or returns `found:false` so the current manual registration flow can continue.

### 3.3 BALCÃO becomes the first source

Every successful resolution is normalized and stored in BALCÃO's own catalog cache. Future scans should normally be answered from BALCÃO without calling external providers again.

Manual/first-party corrections have higher authority than external sources and must not be overwritten automatically by future enrichment.

### 3.4 Category is optional

The resolver may classify a product into a broad category for analytics, but failure to classify must return `Não classificado` and must not block any operational flow.

### 3.5 Server-side provider access

All external calls are made server-side. Browser clients call only BALCÃO endpoints. This avoids CORS differences, prevents provider-specific logic from leaking into the UI and lets BALCÃO centrally enforce timeouts/rate limits.

## 4. Verified external providers

The following sources were reviewed against their public documentation on 2026-08-29.

### 4.1 Open Facts Universal

Endpoint:

`GET https://world.openfoodfacts.org/api/v3/product/{EAN}?product_type=all`

Official documentation confirms that `product_type=all` searches/redirects across food, beauty, pet food and generic products. BALCÃO sends an identifying User-Agent.

Useful fields include code, product name, brand, image, product type and category/taxonomy fields when available.

Docs:
- https://openfoodfacts.github.io/documentation/docs/Product-Opener/v3/products/get-api-v3-product-code/
- https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/scanning-cosmetics-pet-food-and-other-products/

### 4.2 ProductGuru

Endpoint:

`GET https://myproduct.guru/scan/{EAN}`

Public documentation states no authentication or registration is required. ProductGuru reports roughly 35M products, EAN-8/EAN-13 lookup, 100+ countries, and fields including product name, brand, manufacturer, category and country. Product records may also expose a CertaScore/data-confidence concept.

Docs:
- https://myproduct.guru/about
- https://myproduct.guru/data-sources

### 4.3 BarcodeFinder

Primary endpoint:

`GET https://api.barcodefinder.info/barcode/{EAN}`

The public free API page documents no API key for the free tier and a 1,000/day allowance. Typical fields include barcode, title, brand, category, description and images.

This provider remains defensive/optional because its documentation has historically exposed more than one URL shape. A 401/403/404/429/5xx response is treated as provider failure, never as a BALCÃO failure.

Docs:
- https://www.barcodefinder.info/free-api

### 4.4 Datakick / GTINSearch

Endpoint:

`GET https://www.gtinsearch.org/api/items/{EAN}`

Public docs state that authentication is optional and no rate limit is declared. HTTPS is required.

Docs:
- https://gtinsearch.org/api

### 4.5 UPCitemdb Free

Endpoint:

`GET https://api.upcitemdb.com/prod/trial/lookup?upc={EAN}`

Free tier requires no signup/key and provides full database access, but it is scarce capacity: 100 combined requests/day, 6 lookup requests/minute, one connection, and a sustainable rate around one request per 10 seconds. Free batch lookup supports up to two UPC/EAN values per request.

Useful fields can include title, brand, model, description, dimension, weight, category and images.

Because of its tight limits, this source is late in the cascade and must not be spent on products already resolved elsewhere.

Docs:
- https://upcitemdb.com/api
- https://www.upcitemdb.com/wp/docs/main/development/plan/

### 4.6 Produto.xyz

Endpoint:

`GET https://produto.xyz/v1/gtin/{EAN}`

Public repository documents GTIN lookup returning product name, category and manufacturer. The project identifies the current API as alpha, so this adapter must be failure-tolerant.

Docs:
- https://github.com/produtoxyz/api.doc

### 4.7 Brocade

Endpoint:

`GET https://www.brocade.io/api/items/{EAN}`

Repository documentation says read access works without authentication and can return GTIN, name, brand and arbitrary properties. The upstream repository was archived in December 2025, so this provider is low-authority/best-effort and must never be operationally required.

Docs:
- https://github.com/EventideSystems/brocade.io

### 4.8 EanPictures

Data endpoint:

`GET http://www.eanpictures.com.br:9000/api/desc/{EAN}`

Image endpoint:

`GET http://www.eanpictures.com.br:9000/api/gtin/{EAN}`

The public site documents description/JSON/image endpoints. Because it uses HTTP on port 9000, BALCÃO must call it server-side with a short timeout and treat network/protocol failures as a normal miss.

Docs:
- https://eanpictures.com.br/

## 5. Universal resolver architecture

Create a provider-neutral resolver under `lib/inventory/catalog/`.

Suggested modules:

- `types.ts` — canonical provider/result contracts;
- `normalize.ts` — field cleanup and GTIN normalization;
- `merge.ts` — deterministic multi-source merge;
- `category.ts` — broad-category mapping;
- `resolver.ts` — orchestration, waves, deadlines and provider budget;
- `providers/openFacts.ts`;
- `providers/productGuru.ts`;
- `providers/barcodeFinder.ts`;
- `providers/gtinSearch.ts`;
- `providers/upcItemDb.ts`;
- `providers/produtoXyz.ts`;
- `providers/brocade.ts`;
- `providers/eanPictures.ts`.

The existing API route becomes a thin transport/cache layer rather than containing provider-specific parsing.

## 6. Canonical normalized result

Provider adapters return a common object similar to:

```ts
type CatalogCandidate = {
  barcode: string
  name?: string
  brand?: string
  manufacturer?: string
  categoryRaw?: string
  categoryGeneral?: GeneralCategory
  description?: string
  imageUrl?: string
  imageUrls?: string[]
  model?: string
  color?: string
  size?: string
  weight?: string
  country?: string
  packageDescription?: string
  packageQuantity?: number
  ncm?: string
  cest?: string
  provider: CatalogProvider
  providerConfidence?: number
  providerProductType?: string
  metadata?: Record<string, unknown>
}
```

Only `barcode` is structurally required at adapter level. A candidate without a usable product name cannot by itself complete identification, but its fields may enrich another candidate.

Final resolver response remains backward-compatible:

```json
{
  "found": true,
  "source": "BALCÃO Universal",
  "cached": false,
  "product": {
    "barcode": "...",
    "name": "...",
    "brand": "...",
    "imageUrl": "...",
    "categoryGeneral": "..."
  }
}
```

Additional enriched fields may be included without making current clients depend on them.

## 7. Merge policy

The resolver should not blindly return whichever network request wins first.

It uses deterministic field-level precedence and agreement signals.

### Identity completion

A lookup is operationally resolved when there is a valid barcode plus a usable name.

### Field merge

- keep the best usable name;
- fill missing brand/manufacturer/category/image/model/etc. from other candidates;
- prefer non-empty structured fields over generated prose;
- preserve provider provenance for every accepted field in `raw_metadata`;
- never overwrite a manually corrected BALCÃO canonical value with a lower-authority external value.

### Confidence

Confidence is internal and best-effort. Signals may include:

- provider-declared confidence (e.g. ProductGuru CertaScore if exposed by the endpoint);
- agreement of name/brand across independent sources;
- completeness;
- source-specific reliability rank;
- valid GTIN checksum.

Confidence is not shown as a mandatory user decision in v10.4.

## 8. Provider waves and budgets

The resolver operates in waves rather than sequentially calling every source.

### Cache / first-party

1. BALCÃO canonical cache

If a fresh and usable first-party/cache result exists, return immediately.

### Wave A — broad/free/best operational value

Run with bounded concurrency:

1. Open Facts Universal
2. ProductGuru
3. GTINSearch
4. Produto.xyz
5. EanPictures
6. Brocade

Wait only until the wave deadline. Merge successful candidates.

If identity is strong enough, do not spend scarce providers.

### Wave B — scarce/secondary enrichment

Only if Wave A did not resolve identity strongly enough or important identity fields remain missing:

1. BarcodeFinder
2. UPCitemdb

UPCitemdb receives a local rate limiter/budget guard because its free allowance is only 100 requests/day and 6 lookups/minute.

### Deadlines

Each provider gets a short AbortController timeout. The resolver itself has a total deadline so a dead provider cannot make scanning feel broken.

Recommended starting values to benchmark, not hard product guarantees:

- fast provider timeout: ~2.5–3.5s;
- EanPictures/Brocade timeout: shorter due to reliability concerns;
- total single-EAN resolver deadline: ~5s before returning the best available result/manual fallback.

## 9. Category model

Broad category is analytics-oriented and optional.

Initial enum:

- `Alimentos e bebidas`
- `Higiene e beleza`
- `Limpeza`
- `Utilidades domésticas`
- `Saúde`
- `Vestuário`
- `Eletrônicos`
- `Pet`
- `Livros e mídia`
- `Casa e construção`
- `Outros`
- `Não classificado`

Classification sources, in order:

1. explicit provider product type/category;
2. NCM/CEST mappings when available and confidently mapped;
3. deterministic normalized keywords from product/category fields;
4. `Não classificado`.

No LLM call is required for normal barcode scanning in v10.4.

## 10. BALCÃO catalog persistence

Extend `inventory_v1_product_catalog_cache` only for fields useful as canonical/queryable data:

- `manufacturer text`;
- `category_general text`;
- `category_raw text`;
- `confidence_score numeric`;
- optionally `canonical_updated_at timestamptz` if needed separately from `checked_at`.

Keep long-tail attributes in `raw_metadata` rather than creating a column for every possible product family.

`raw_metadata` stores:

- provider candidates;
- provider-specific product IDs;
- provenance per merged field;
- model/color/size/weight/country/packaging/NCM/CEST when available;
- timestamps and provider status summaries;
- manual/first-party authority markers.

This deliberately lets the BALCÃO database grow in coverage without forcing the operational inventory product schema to become an electronics/clothing/medicine schema.

## 11. Cache strategy

### Positive cache

A usable BALCÃO record is returned before external calls.

A long TTL is appropriate because basic identity fields change rarely. Manual corrections can invalidate/refresh explicitly.

### Negative cache

Store a short-lived miss marker so repeated scans of an unknown EAN do not hammer eight providers repeatedly.

Negative cache must expire much faster than positive cache because an external database may gain the product later.

### Re-enrichment

Do not make re-enrichment part of the blocking scan path. A future version may refresh stale/incomplete records asynchronously. v10.4 may re-query only when the cache record is missing or structurally unusable.

## 12. Batch lookup for large intake

Add a server-side batch endpoint designed for future large purchase/order/NF-e flows:

`POST /api/products/lookup/batch`

Request:

```json
{
  "barcodes": ["EAN1", "EAN2", "EAN3"]
}
```

Requirements:

1. validate and normalize all codes;
2. deduplicate internally;
3. query BALCÃO cache for all codes in one database request;
4. resolve only cache misses;
5. use bounded concurrency across products;
6. enforce provider-level concurrency/rate budgets globally for the batch;
7. exploit provider batch capability where safe (UPCitemdb Free supports up to two codes per request);
8. write successful results back in batches where practical;
9. return results aligned to the original input order;
10. return partial success rather than failing the whole batch if some EANs are unresolved.

Example result item:

```json
{
  "barcode": "789...",
  "found": true,
  "cached": false,
  "product": { "name": "...", "brand": "..." }
}
```

Unresolved item:

```json
{
  "barcode": "789...",
  "found": false
}
```

The endpoint must impose a server-side maximum batch size to prevent abuse and accidental provider exhaustion. Initial implementation target: 100 unique codes/request, with internal concurrency far lower than 100.

## 13. Large-order future compatibility

v10.4 does not need to implement every future invoice/order ingestion UI, but its resolver must support this future workflow:

1. user uploads/reads a large incoming order, invoice or item list;
2. BALCÃO extracts supplier product codes/EANs;
3. batch resolver identifies all known barcodes;
4. BALCÃO cache answers repeated products immediately;
5. only new EANs consume external lookups;
6. unresolved products are grouped into a small manual-resolution queue rather than interrupting the entire intake.

This is a hard architectural requirement for v10.4 because it determines rate limiting and batch design now.

## 14. Existing flows and compatibility

The following must keep working:

- unit product scan;
- manual product registration;
- checkout scan;
- NF-e v10.x resolver;
- supplier aliases;
- product soft-delete/reactivation;
- sale-price-pending behavior;
- BALCÃO branding;
- local/cloud inventory sync.

The single-product lookup response remains compatible with the v10.3 UI.

## 15. Error handling

Provider adapter errors are represented internally and never directly exposed as a failed scan unless BALCÃO itself cannot process the request.

Expected provider outcomes:

- `hit` — candidate data returned;
- `miss` — provider knows no product;
- `rate_limited` — 429/budget exhausted;
- `timeout`;
- `unavailable` — network/5xx/protocol problem;
- `invalid_response` — malformed/unexpected schema.

A resolver request succeeds even if seven providers fail and one identifies the product.

If no provider identifies the product, return `found:false` and preserve the current manual flow.

## 16. Security and operational safeguards

- external URLs are constants; clients cannot supply arbitrary provider URLs;
- validate barcode format before any outbound request;
- never proxy arbitrary remote images through the product lookup endpoint;
- hard response-size limits where practical;
- AbortController timeouts on every provider;
- UPCitemdb and any future scarce source get explicit budget/rate protection;
- avoid logging full provider payloads by default;
- log provider name, outcome, duration and status for diagnostics;
- provider failures must not reveal infrastructure secrets.

## 17. Licensing/provenance

Because BALCÃO is building its own derived catalog from multiple sources, provenance must be retained in `raw_metadata`.

Open Facts/Open Food Facts-family data carries open-database licensing requirements; Datakick/GTINSearch explicitly mentions image licensing requirements; other providers may have their own terms. v10.4 stores source attribution and should avoid pretending all externally sourced fields are proprietary BALCÃO-originated data.

The operational goal is a BALCÃO canonical product catalog with traceable source lineage and first-party corrections layered on top.

## 18. Tests

### Unit tests

- every provider adapter converts fixture payloads into `CatalogCandidate`;
- malformed/empty provider payloads return safe misses;
- merge precedence is deterministic;
- manual BALCÃO fields beat external fields;
- category mapping is deterministic and non-blocking;
- GTIN normalization/validation;
- negative-cache expiration behavior;
- provider timeout/rate-limit outcomes.

### Resolver tests

- cache hit causes zero external calls;
- Wave A strong identity prevents Wave B calls;
- Wave B runs when Wave A cannot identify;
- one working provider succeeds despite others failing;
- richer fields from multiple providers merge without losing provenance;
- total deadline returns best candidate instead of hanging;
- UPCitemdb budget exhaustion skips it cleanly.

### Batch tests

- deduplication;
- mixed cache hits/misses;
- partial success;
- stable output order;
- bounded concurrency;
- unique-code maximum;
- provider budgets shared across batch.

### Regression tests

All existing inventory v10.x tests remain in CI. Version advances to v10.4 only after test suite + production build pass.

## 19. Acceptance criteria

v10.4 is complete when:

1. the single-EAN lookup can identify products through the universal provider resolver;
2. the current scanner UI needs no extra mandatory fields;
3. category is stored when available but never blocks registration;
4. every successful external resolution grows the BALCÃO catalog cache;
5. manual corrections are protected from automatic external overwrite;
6. provider outages/rate limits degrade to other providers/manual entry;
7. UPCitemdb's free quota is protected;
8. a batch endpoint can resolve up to the configured unique-code limit with partial results and bounded concurrency;
9. the existing inventory/NF-e/checkout/soft-delete flows remain compatible;
10. all tests and production build pass before promotion.

## 20. Explicit non-goals for v10.4

- becoming an official GS1 directory;
- claiming complete ANVISA medication coverage;
- requiring category-specific schemas in the inventory UI;
- adding nutrition/ingredients UI;
- introducing LLM calls into normal barcode lookup;
- scraping arbitrary retailer pages;
- paid API subscriptions;
- background re-enrichment infrastructure beyond what is necessary for correct synchronous lookup/batch behavior.
