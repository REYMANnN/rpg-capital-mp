# Inventory v10 Note Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a camera-first NF-e purchase intake with deterministic product matching, global supplier-code memory, ambiguity confirmation, editable final review, and checked-item import.

**Architecture:** Keep the proven unit barcode scanner and reuse it for a new `invoice` scan target. Add focused inventory modules for NF-e key validation, deterministic product-name matching, and invoice resolution. Persist global `supplier_document + supplier_code -> EAN` mappings in Supabase behind RPCs; use the existing local-first state for store products and purchase movements.

**Tech Stack:** Next.js 16, React, TypeScript, barcode-detector ponyfill/ZXing-C++, Supabase Postgres/RPC/RLS, Node tests via `tsx`.

**Spec:** `docs/superpowers/specs/2026-08-28-inventory-v10-note-intelligence-design.md`

## Global Constraints

- Visible app version is `v10` only after the entire flow is present and verified.
- Do not replace or rework the unit scanner that has already been physically validated.
- Product matching must not require an LLM.
- Real NF-e line-item retrieval must never be falsely represented as universally public from a 44-digit key.
- XML import remains available as fallback.
- Global supplier mappings are conflict-safe and never silently overwrite a different EAN.

---

### Task 1: NF-e key validation and resolver fixture

**Files:**
- Create: `lib/inventory/nfeKey.ts`
- Create: `lib/inventory/nfeDemo.ts`
- Create: `tests/nfeKey.test.ts`
- Create: `app/api/inventory/nfe/resolve/route.ts`

**Interfaces:**
- Produces: `normalizeNfeAccessKey(value): string`, `isValidNfeAccessKey(value): boolean`, `DEMO_NFE_ACCESS_KEY`, `demoNfeXmlForKey(key): string | null`.
- API: `POST /api/inventory/nfe/resolve { accessKey }` -> `{ ok, found, source, xml? | reason? }`.

- [ ] Write tests for whitespace normalization, 44-digit length, modulo-11 DV, valid demo key, and invalid key.
- [ ] Run the test and confirm red.
- [ ] Implement the key validator and deterministic demo fixture matching the generated test barcode.
- [ ] Add resolver route: demo key returns demo XML; real valid key returns `provider_not_configured` until authorized provider environment is configured.
- [ ] Run tests and commit.

### Task 2: Deterministic product-name matcher

**Files:**
- Create: `lib/inventory/productMatcher.ts`
- Create: `tests/productMatcher.test.ts`

**Interfaces:**
- Produces `normalizeProductName(text): string` and `scoreProductCandidate(query, candidate): number` in `[0,1]`.

- [ ] Write failing tests covering `REFRI COCACOLA2L` vs `Coca-Cola Original 2 litros`, accent/punctuation normalization, measurement mismatch penalty, and unrelated products.
- [ ] Implement normalization with unit aliases and token/edit similarity.
- [ ] Run tests; require strong match >= 0.78 and mismatched size below threshold.
- [ ] Commit.

### Task 3: Global supplier product memory

**Database:**
- Create public table `inventory_v10_supplier_product_aliases` with RLS enabled and no direct anon table grants.
- Create RPC `inventory_v10_lookup_supplier_product(text,text)` returning exact alias.
- Create RPC `inventory_v10_confirm_supplier_product(text,text,text,text,text)` that inserts/strengthens same-EAN mappings and flags conflicting EANs without overwrite.

**Files:**
- Create: `app/api/inventory/supplier-product/route.ts`

**Interfaces:**
- `GET ?supplierDocument=&supplierCode=` -> mapping or not found.
- `POST { supplierDocument, supplierCode, barcode, canonicalName, supplierDescription }` -> confirmed/conflict.

- [ ] Apply schema/RPC migration.
- [ ] Verify RLS and RPC behavior with test SQL.
- [ ] Implement thin Next route using publishable Supabase client.
- [ ] Commit.

### Task 4: Invoice line resolution engine

**Files:**
- Create: `lib/inventory/invoiceResolver.ts`
- Create: `tests/invoiceResolver.test.ts`

**Interfaces:**
- Consumes parsed NF-e lines, store products/catalog candidates, and global supplier mapping results.
- Produces resolved line states: `ean`, `supplier`, `candidate`, `unresolved` with candidate score and editable commercial fields.

- [ ] Write tests for precedence: EAN > supplier mapping > name candidate > unresolved.
- [ ] Implement pure resolution helpers.
- [ ] Run tests and commit.

### Task 5: v10 camera-first intake UI

**Files:**
- Modify: `app/inventory-v1/InventoryV1.tsx`
- Modify: `app/inventory-v1/inventory.module.css`

**Behavior:**
- Add `invoice` to scanner target.
- Entrada primary button becomes `Escanear nota`; XML remains secondary.
- 44-digit scan calls resolver API, parses returned XML, then runs invoice resolution.
- Demo key executes full flow.
- Real key with no provider shows a precise explanation and keeps XML fallback.
- Ambiguous items are handled first with `Sim`, `Não`, search/scan/manual EAN association.
- After ambiguities, show complete list with checkbox per item, select-all, and edit action.
- Line editor changes product/EAN, description, quantity and purchase unit cost before import.
- Confirm import uses checked lines only and writes supplier metadata.

- [ ] Patch UI without changing scanner component internals.
- [ ] Add mobile-first CSS for ambiguity cards, checkable review rows, and line editor.
- [ ] Run build and fix TypeScript issues.
- [ ] Commit.

### Task 6: Persist supplier metadata and mapping confirmations

**Files:**
- Modify: `app/inventory-v1/InventoryV1.tsx`

- [ ] Extend `Movement` with optional supplier/document fields already supported by the database RPC.
- [ ] Purchase movement writes `supplierDocument`, `supplierName`, `invoiceKey`, `invoiceNumber`.
- [ ] Confirming a candidate or manual EAN calls global supplier-product confirmation endpoint.
- [ ] Duplicate invoice detection uses structured `invoiceKey` with note fallback for old data.
- [ ] Commit.

### Task 7: v10 version and verification

**Files:**
- Modify: `lib/inventory/version.ts`

- [ ] Set `INVENTORY_APP_VERSION = 'v10'`.
- [ ] Run all inventory tests: NF-e parser, purchase math/rules, scanner policy, NF-e key, matcher, resolver.
- [ ] Run production Next.js build and require TypeScript success.
- [ ] Verify Vercel deployment is READY.
- [ ] Verify `/inventory-v1` returns HTTP 200, `/api/inventory/state` reports v10, product lookup still returns known EAN, and demo NF-e resolver returns the fixture.
- [ ] Check runtime errors for the new deployment.
